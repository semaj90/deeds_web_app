#ifdef _WIN32
#define NOMINMAX
#include <windows.h>
#include <winioctl.h>
#include <cstdint>
#include <cctype>
#include <cstdio>
#include <cstring>
#include <cstdlib>
#include <iomanip>
#include <iostream>
#include <sstream>
#include <string>
#include <vector>

namespace {

constexpr DWORD kFsctlQueryUsnJournal = CTL_CODE(FILE_DEVICE_FILE_SYSTEM, 61, METHOD_BUFFERED, FILE_ANY_ACCESS);
constexpr DWORD kFsctlReadUsnJournal = CTL_CODE(FILE_DEVICE_FILE_SYSTEM, 46, METHOD_BUFFERED, FILE_ANY_ACCESS);
constexpr size_t kBufferBytes = 1024 * 1024;

std::string jsonEscape(const std::string& input) {
  std::string output;
  for (unsigned char value : input) {
    switch (value) {
      case '"': output += "\\\""; break;
      case '\\': output += "\\\\"; break;
      case '\b': output += "\\b"; break;
      case '\f': output += "\\f"; break;
      case '\n': output += "\\n"; break;
      case '\r': output += "\\r"; break;
      case '\t': output += "\\t"; break;
      default:
        if (value < 0x20) {
          char escaped[7];
          std::snprintf(escaped, sizeof(escaped), "\\u%04x", value);
          output += escaped;
        } else {
          output += static_cast<char>(value);
        }
    }
  }
  return output;
}

std::string utf8(const wchar_t* value, int length) {
  if (length <= 0) return {};
  const int bytes = WideCharToMultiByte(CP_UTF8, WC_ERR_INVALID_CHARS, value, length, nullptr, 0, nullptr, nullptr);
  if (bytes <= 0) return {};
  std::string output(static_cast<size_t>(bytes), '\0');
  if (WideCharToMultiByte(CP_UTF8, WC_ERR_INVALID_CHARS, value, length, output.data(), bytes, nullptr, nullptr) != bytes) return {};
  return output;
}

void fail(const char* reason, DWORD code = 0) {
  std::cout << "{\"ok\":false,\"reason\":\"" << reason << "\",\"win32Error\":" << code << "}\n";
}

bool queryJournal(HANDLE volume, USN_JOURNAL_DATA_V0& journal, DWORD& error) {
  DWORD returned = 0;
  if (!DeviceIoControl(volume, kFsctlQueryUsnJournal, nullptr, 0, &journal, sizeof(journal), &returned, nullptr)) {
    error = GetLastError();
    return false;
  }
  return true;
}

bool parseUnsigned(const char* input, uint64_t& value) {
  if (!input || !*input || *input == '-') return false;
  char* end = nullptr;
  value = _strtoui64(input, &end, 10);
  return end && *end == '\0';
}

std::string fileIdV3(const FILE_ID_128& id) {
  std::ostringstream output;
  output << std::hex << std::setfill('0');
  for (int index = 15; index >= 0; --index) output << std::setw(2) << static_cast<unsigned int>(id.Identifier[index]);
  return output.str();
}

}

int main(int argc, char** argv) {
  if (argc < 2 || argc > 4) {
    std::cerr << "usage: ntfs-usn-reader-v1 <volume-letter> [start-usn-decimal] [max-records]\n";
    return 2;
  }
  std::string volumeArg = argv[1];
  if (volumeArg.size() != 1 || !((volumeArg[0] >= 'A' && volumeArg[0] <= 'Z') || (volumeArg[0] >= 'a' && volumeArg[0] <= 'z'))) {
    fail("INVALID_VOLUME_LETTER");
    return 2;
  }
  const char drive = static_cast<char>(std::toupper(static_cast<unsigned char>(volumeArg[0])));
  const std::wstring volumePath = L"\\\\.\\" + std::wstring(1, static_cast<wchar_t>(drive)) + L":";
  const std::wstring rootPath = std::wstring(1, static_cast<wchar_t>(drive)) + L":\\";
  DWORD volumeSerial = 0;
  wchar_t volumeGuidBuffer[MAX_PATH]{};
  if (!GetVolumeInformationW(rootPath.c_str(), nullptr, 0, &volumeSerial, nullptr, nullptr, nullptr, 0)) {
    fail("VOLUME_ID_QUERY_FAILED", GetLastError());
    return 1;
  }
  if (!GetVolumeNameForVolumeMountPointW(rootPath.c_str(), volumeGuidBuffer, MAX_PATH)) {
    fail("VOLUME_GUID_QUERY_FAILED", GetLastError());
    return 1;
  }
  HANDLE volume = CreateFileW(volumePath.c_str(), GENERIC_READ, FILE_SHARE_READ | FILE_SHARE_WRITE | FILE_SHARE_DELETE,
                              nullptr, OPEN_EXISTING, 0, nullptr);
  if (volume == INVALID_HANDLE_VALUE) {
    const DWORD openError = GetLastError();
    fail(openError == ERROR_ACCESS_DENIED ? "ADMINISTRATOR_REQUIRED" : "VOLUME_OPEN_FAILED", openError);
    return 1;
  }

  USN_JOURNAL_DATA_V0 initial{};
  DWORD error = 0;
  if (!queryJournal(volume, initial, error)) {
    CloseHandle(volume);
    fail("JOURNAL_QUERY_FAILED", error);
    return 1;
  }

  uint64_t start = static_cast<uint64_t>(initial.NextUsn);
  if (argc >= 3 && !parseUnsigned(argv[2], start)) {
    CloseHandle(volume);
    fail("INVALID_START_USN");
    return 2;
  }
  uint64_t maxRecords = 10000;
  if (argc >= 4 && (!parseUnsigned(argv[3], maxRecords) || maxRecords == 0 || maxRecords > 1000000)) {
    CloseHandle(volume);
    fail("INVALID_MAX_RECORDS");
    return 2;
  }
  if (start < static_cast<uint64_t>(initial.LowestValidUsn)) {
    CloseHandle(volume);
    fail("JOURNAL_GAP_REQUIRES_FULL_SCAN", ERROR_JOURNAL_ENTRY_DELETED);
    return 3;
  }
  if (start > static_cast<uint64_t>(initial.NextUsn)) {
    CloseHandle(volume);
    fail("CHECKPOINT_AHEAD_OF_JOURNAL");
    return 3;
  }

  READ_USN_JOURNAL_DATA_V0 request{};
  request.StartUsn = static_cast<USN>(start);
  request.ReasonMask = 0xffffffff;
  request.ReturnOnlyOnClose = FALSE;
  request.UsnJournalID = initial.UsnJournalID;
  std::vector<unsigned char> buffer(kBufferBytes);
  std::vector<std::string> records;
  USN cursor = request.StartUsn;
  bool malformed = false;

  while (static_cast<uint64_t>(cursor) < static_cast<uint64_t>(initial.NextUsn) && records.size() < maxRecords) {
    request.StartUsn = cursor;
    DWORD returned = 0;
    if (!DeviceIoControl(volume, kFsctlReadUsnJournal, &request, sizeof(request), buffer.data(), static_cast<DWORD>(buffer.size()), &returned, nullptr)) {
      error = GetLastError();
      CloseHandle(volume);
      fail(error == ERROR_JOURNAL_ENTRY_DELETED ? "JOURNAL_GAP_REQUIRES_FULL_SCAN" : "JOURNAL_READ_FAILED", error);
      return error == ERROR_JOURNAL_ENTRY_DELETED ? 3 : 1;
    }
    if (returned < sizeof(USN)) break;
    USN nextCursor = 0;
    std::memcpy(&nextCursor, buffer.data(), sizeof(nextCursor));
    if (nextCursor <= cursor) break;
    size_t offset = sizeof(USN);
    bool recordLimitReached = false;
    while (offset + sizeof(USN_RECORD_COMMON_HEADER) <= returned) {
      const auto* header = reinterpret_cast<const USN_RECORD_COMMON_HEADER*>(buffer.data() + offset);
      if (header->RecordLength < sizeof(USN_RECORD_COMMON_HEADER) || offset + header->RecordLength > returned) {
        malformed = true;
        break;
      }
      uint64_t fileId = 0;
      uint64_t parentId = 0;
      std::string fileIdText;
      std::string parentIdText;
      const char* fileIdKind = nullptr;
      USN recordUsn = 0;
      DWORD reason = 0;
      USHORT nameLength = 0;
      USHORT nameOffset = 0;
      if (header->MajorVersion == 2 && header->RecordLength >= sizeof(USN_RECORD_V2)) {
        const auto* record = reinterpret_cast<const USN_RECORD_V2*>(header);
        fileId = record->FileReferenceNumber;
        parentId = record->ParentFileReferenceNumber;
        fileIdText = std::to_string(fileId);
        parentIdText = std::to_string(parentId);
        fileIdKind = "FRN64_DECIMAL";
        recordUsn = record->Usn;
        reason = record->Reason;
        nameLength = record->FileNameLength;
        nameOffset = record->FileNameOffset;
      } else if (header->MajorVersion == 3 && header->RecordLength >= sizeof(USN_RECORD_V3)) {
        const auto* record = reinterpret_cast<const USN_RECORD_V3*>(header);
        fileIdText = fileIdV3(record->FileReferenceNumber);
        parentIdText = fileIdV3(record->ParentFileReferenceNumber);
        fileIdKind = "FILE_ID_128_HEX";
        recordUsn = record->Usn;
        reason = record->Reason;
        nameLength = record->FileNameLength;
        nameOffset = record->FileNameOffset;
      } else {
        malformed = true;
        break;
      }
      if (nameLength % sizeof(wchar_t) != 0 || static_cast<size_t>(nameOffset) + static_cast<size_t>(nameLength) > header->RecordLength) {
        malformed = true;
        break;
      }
      const auto* name = reinterpret_cast<const wchar_t*>(reinterpret_cast<const unsigned char*>(header) + nameOffset);
      const std::string nameUtf8 = utf8(name, nameLength / sizeof(wchar_t));
      if (nameLength && nameUtf8.empty()) {
        malformed = true;
        break;
      }
      if (records.size() >= maxRecords) {
        cursor = recordUsn;
        recordLimitReached = true;
        break;
      }
      records.push_back("{\"fileIdKind\":\"" + std::string(fileIdKind) + "\",\"fileId\":\"" + fileIdText + "\",\"parentId\":\"" +
                        parentIdText + "\",\"usn\":\"" + std::to_string(static_cast<uint64_t>(recordUsn)) +
                        "\",\"reason\":" + std::to_string(reason) + ",\"name\":\"" + jsonEscape(nameUtf8) + "\"}");
      offset += header->RecordLength;
    }
    if (malformed) break;
    if (recordLimitReached) break;
    cursor = nextCursor;
    if (records.size() >= maxRecords) break;
  }

  USN_JOURNAL_DATA_V0 finalState{};
  if (!queryJournal(volume, finalState, error)) {
    CloseHandle(volume);
    fail("FINAL_JOURNAL_QUERY_FAILED", error);
    return 1;
  }
  CloseHandle(volume);
  if (malformed) {
    fail("UNSUPPORTED_OR_MALFORMED_JOURNAL_RECORD");
    return 4;
  }
  if (finalState.UsnJournalID != initial.UsnJournalID) {
    fail("JOURNAL_CHANGED_DURING_READ", ERROR_JOURNAL_ENTRY_DELETED);
    return 3;
  }
  if (static_cast<uint64_t>(cursor) < static_cast<uint64_t>(finalState.LowestValidUsn)) {
    fail("JOURNAL_GAP_REQUIRES_FULL_SCAN", ERROR_JOURNAL_ENTRY_DELETED);
    return 3;
  }

  std::cout << "{\"ok\":true,\"schema\":\"atlas.ntfs-usn-read.v1\",\"volumeId\":\"" << jsonEscape(utf8(volumeGuidBuffer, static_cast<int>(wcslen(volumeGuidBuffer))))
            << "\",\"volumeSerial\":\"" << std::hex << std::setw(8) << std::setfill('0') << volumeSerial
            << "\",\"journalId\":\"" << initial.UsnJournalID << "\",\"lowestValidUsn\":\""
            << static_cast<uint64_t>(finalState.LowestValidUsn) << "\",\"startUsn\":\"" << start
            << "\",\"nextUsn\":\"" << static_cast<uint64_t>(finalState.NextUsn) << "\",\"nextReadUsn\":\""
            << static_cast<uint64_t>(cursor) << "\",\"truncated\":"
            << (static_cast<uint64_t>(cursor) < static_cast<uint64_t>(finalState.NextUsn) ? "true" : "false")
            << ",\"recordCount\":" << records.size() << ",\"records\":[";
  for (size_t index = 0; index < records.size(); ++index) {
    if (index) std::cout << ',';
    std::cout << records[index];
  }
  std::cout << "]}\n";
  return 0;
}
#else
int main() { return 2; }
#endif
