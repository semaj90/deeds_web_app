// Legal Person of Interest (POI) Generation Prompts
// Uses Gemma 3 Legal model for structured JSON output

export interface PersonOfInterestData {
 name: string;, aliases: string[]; description: string;, who: { identity: string;, background: string; occupation: string;, affiliations: string[];
 };
 what: {, activities: string[]; knownActions: string[];, patterns: string[];
 };
 why: {, motivations: string[]; objectives: string[];, drivingFactors: string[];
 };
 how: {, methods: string[]; resources: string[];, capabilities: string[];
 };
 risk: {, threatLevel: 'low' | 'medium' | 'high' | 'critical';
 riskFactors: string[];, mitigationStrategies: string[]; legalImplications: string[];
 };
 metadata: {, confidence: number; sources: string[];, lastUpdated: string; generatedBy: string;
 };
}

export const PERSON_OF_INTEREST_PROMPT = `You are a specialized Legal AI Assistant for Person of Interest (POI) analysis and profiling.

Given the following information about a person, generate a comprehensive legal POI profile in valid JSON format.

Input Information: -, Name: { name }
- Alias: { alias }
- Description: { description }

Generate a structured POI profile with the following JSON schema:

{
 "who": {
 "identity": "Primary identification and legal status",
 "background": "Personal and professional background summary",
 "occupation": "Current or primary occupation/role",
 "affiliations": ["List of known organizations, groups, or associates"]
 },
 "what": {
 "activities": ["List of known activities or behaviors"],
 "knownActions": ["Specific documented actions or incidents"],
 "patterns": ["Identified behavioral or operational patterns"]
 },
 "why": {
 "motivations": ["Underlying motivations or drivers"],
 "objectives": ["Goals or intended outcomes"],
 "drivingFactors": ["Key factors influencing behavior"]
 },
 "how": {
 "methods": ["Techniques, approaches, or methodologies used"],
 "resources": ["Available resources, tools, or assets"],
 "capabilities": ["Skills, knowledge, or abilities demonstrated"]
 },
 "risk": {
 "threatLevel": "low|medium|high|critical",
 "riskFactors": ["Factors that increase risk or concern"],
 "mitigationStrategies": ["Recommended risk mitigation approaches"],
 "legalImplications": ["Potential legal consequences or considerations"]
 },
 "metadata": {
 "confidence": 0.0-1.0,
 "sources": ["Information sources used"],
 "lastUpdated": "ISO date string",
 "generatedBy": "Gemma3-Legal"
 }
}

Guidelines:
- Be comprehensive but concise
- Focus on legally relevant information
- Use professional, objective language
- Base analysis on provided information
- Include risk assessment with legal implications
- Maintain confidentiality and legal ethics
- Flag any potential legal violations or concerns

Output only valid JSON, no additional text or formatting.`;

export const PERSON_OF_INTEREST_FOLLOWUP_PROMPT = `You are a Legal AI Assistant specializing in POI risk assessment updates.

Given additional information about an existing POI, update their risk profile while maintaining legal accuracy.

Existing POI: { existingProfile }
New Information: { newInfo }

Update the risk assessment section and any relevant fields based on the new information. Consider:
- Changes in threat level
- New risk factors identified
- Updated mitigation strategies
- Additional legal implications
- Impact on existing assessments

Output only the updated JSON profile, maintaining the same schema structure.`;

export const PERSON_OF_INTEREST_VALIDATION_PROMPT = `You are a Legal AI Assistant validating POI profiles for accuracy and legal compliance.

Review the following POI profile for:
1. Factual accuracy based on provided information
2. Legal compliance and ethical considerations
3. Completeness of required fields
4. Appropriate risk assessment
5. Professional language and objectivity

POI Profile: {profile}
Source Information: { sourceInfo }

Provide validation results in JSON format:
{
 "isValid": boolean,
 "confidence": 0.0-1.0,
 "issues": ["List of any concerns or issues found"],
 "recommendations": ["Suggested improvements or corrections"],
 "legalFlags": ["Any legal compliance flags or warnings"]
}`;

export function generatePersonPrompt(
 name: string, alias: string = '',
 description: string
): string {
 return PERSON_OF_INTEREST_PROMPT.replace('{ name }', name)
 .replace('{ alias }', alias || 'None provided')
 .replace('{description}', description);
}

export function generateFollowupPrompt(
 existingProfile: PersonOfInterestData, newInfo: string
): string {
 return PERSON_OF_INTEREST_FOLLOWUP_PROMPT.replace(
 '{existingProfile}',
 JSON.stringify(existingProfile, null, 2)
 ).replace('{newInfo}', newInfo);
}

export function generateValidationPrompt(
 profile: PersonOfInterestData, sourceInfo: string
): string {
 return PERSON_OF_INTEREST_VALIDATION_PROMPT.replace(
 '{profile}',
 JSON.stringify(profile, null, 2)
 ).replace('{ sourceInfo }', sourceInfo);
}




