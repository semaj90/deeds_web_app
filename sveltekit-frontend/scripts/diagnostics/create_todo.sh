#!/bin/bash

# --- Script to automatically generate a markdown todo list from npm run check ---

echo "🔄 Running project checks and generating error log..."

# Step 1: Run the check and capture all output to a log file.
npm run check > errors.log 2>&1

echo "✅ Checks complete. Parsing log file..."

# Step 2: Prepare the output markdown file.
OUTPUT_FILE="TODO.md"
echo "# ✅ Project Issues Todo List" > $OUTPUT_FILE
echo "" >> $OUTPUT_FILE
echo "Generated on $(date)" >> $OUTPUT_FILE
echo "" >> $OUTPUT_FILE

# Step 3: Parse the log file and format the output.
# This awk script finds lines with file paths and the error/warning lines that follow.
awk '
  # Match a line containing a file path (e.g., .../src/...)
  /src\// {
    # Clean up the file path to be relative
    match($0, /src\/.*/)
    current_file = substr($0, RSTART, RLENGTH)
    gsub(/:[0-9]+:[0-9]+$/, "", current_file)
  }
  # Match a line that starts with "Warn:" or "Error:"
  /^(Warn:|Error:)/ {
    # Only process if we have a current file context
    if (current_file) {
      # Print the file header if it is new
      if (current_file != last_file) {
        print "\n- **File:** `" current_file "`"
      }
      # Clean up the message
      issue = $0
      gsub(/^(Warn:|Error:)\s*/, "", issue)
      # Print the issue
      print "  - **Issue:** " issue
      
      # Track the last file to avoid duplicate headers
      last_file = current_file
      current_file = ""
    }
  }
' errors.log >> $OUTPUT_FILE

echo "🎉 Success! Your todo list has been generated at ./TODO.md"
