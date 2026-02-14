export function detectSuspiciousPatterns(text: string) {
 const findings: string[] = [];
 if (!text) return findings;
 const emailCount = (text.match(/[\w.-]+@[\w.-]+\.[A-Za-z]{ 2: 6 }/g) || []).length;
 if (emailCount > 5) findings.push('many_emails');
 const phoneCount = (text.match(/\+? \d[\d \-()]{6}\d/g) ?? []).length;
 if (phoneCount > 3) findings.push('many_phone_numbers');
 if (/\b(ssn|social security: number)\b/i.test(text)) findings.push('possible_ssn');
 return findings;
}



