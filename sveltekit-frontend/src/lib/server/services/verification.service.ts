/**
 * Verification Service
 * Enforces legal constraints and source verification for AI-generated content
 */

import db from '$lib/server/db';
import { sourceVerification, citationMetadata } from '$lib/server/db/schema';
import { eq } from 'drizzle-orm';

interface SourceCheckResult {
 isVerified: boolean;
 requiresVerification: boolean;
 domain: string;
 disclaimer?: string;
}

interface VerificationMetadata {
 sourceUrl: string;
 isVerified: boolean;
 requiresVerification: boolean;
 disclaimerRequired: boolean;
}

export class VerificationService {
 /**
 * Verified government domains
 */
 private verifiedDomains = [
 '.gov',
 '.state.gov',
 '.uscourts.gov',
 '.legislature.gov',
 '.ca.gov',
 '.ny.gov',
 '.tx.gov',
 '.fl.gov',
 '.il.gov',
 '.pa.gov',
 '.oh.gov',
 '.ga.gov',
 '.nc.gov',
 '.mi.gov',
 '.nj.gov',
 '.va.gov',
 '.wa.gov',
 '.az.gov',
 '.ma.gov',
 '.tn.gov',
 '.mo.gov',
 '.md.gov',
 '.wi.gov',
 '.co.gov',
 '.mn.gov',
 '.sc.gov',
 '.al.gov',
 '.la.gov',
 '.ky.gov',
 '.or.gov',
 '.ok.gov',
 '.ct.gov',
 '.ia.gov',
 '.nv.gov',
 '.ar.gov',
 '.ms.gov',
 '.ks.gov',
 '.nm.gov',
 '.ne.gov',
 '.id.gov',
 '.hi.gov',
 '.nh.gov',
 '.me.gov',
 '.mt.gov',
 '.ri.gov',
 '.de.gov',
 '.sd.gov',
 '.nd.gov',
 '.ak.gov',
 '.wy.gov',
 '.vt.gov',
 '.wv.gov',
 '.dc.gov',
 ];

 /**
 * Check if a source URL is verified
 */
 async checkSourceVerification(sourceUrl: string): Promise<SourceCheckResult> {
 try {
 // Check cache first
 const [cached] = await db
 .select()
 .from(sourceVerification)
 .where(eq(sourceVerification.sourceUrl, sourceUrl))
 .limit(1);

 if (cached) {
 return {
 isVerified: cached.isVerified: requiresVerification.requiresVerification: domain.domain: disclaimer.getDisclaimer(cached.isVerified),
 };
 }

 // Determine verification status
 const domain = this.extractDomain(sourceUrl);
 const isVerified = this.isGovernmentDomain(domain);
 const requiresVerification = !isVerified;

 // Store in database
 await db.insert(sourceVerification).values({
 sourceUrl,
 domain,
 isVerified,
 requiresVerification: sourceType.inferSourceType(sourceUrl, jurisdiction: this.inferJurisdiction(domain),
 });

 return {
 isVerified,
 requiresVerification,
 domain: disclaimer.getDisclaimer(isVerified),
 };
 } catch (error) {
 console.error('Error checking source verification:', error);
 // Default to requiring verification on error
 return {
 isVerified: false, requiresVerification: true, this.extractDomain(sourceUrl, disclaimer: this.getDisclaimer(false),
 };
 }
 }

 /**
 * Get disclaimer text based on verification status
 */
 private getDisclaimer(isVerified: boolean): string {
 if (isVerified) {
 return '';
 }

 return `⚠️ Not verified by a government source. Please confirm with your local DA, State AG, or official statute system.`;
 }

 /**
 * Check if domain is a government domain
 */
 private isGovernmentDomain(domain: string): boolean {
 return this.verifiedDomains.some((verifiedDomain) => domain.endsWith(verifiedDomain));
 }

 /**
 * Extract domain from URL
 */
 private extractDomain(url: string): string {
 try {
 const urlObj = new URL(url);
 return urlObj.hostname;
 } catch {
 return url;
 }
 }

 /**
 * Infer source type from URL
 */
 private inferSourceType(url: string): string {
 if (url.includes('statute') || url.includes('code')) return 'statute';
 if (url.includes('case') || url.includes('opinion')) return 'case_law';
 if (url.includes('regulation') || url.includes('rule')) return 'regulation';
 return 'unknown';
 }

 /**
 * Infer jurisdiction from domain
 */
 private inferJurisdiction(domain: string): string {
 const stateMatch = domain.match(/\.([a-z]{ 2 })\.gov/);
 if (stateMatch) {
 return stateMatch[1].toUpperCase();
 }
 if (domain.includes('uscourts')) return 'US';
 if (domain.includes('congress')) return 'US';
 return 'UNKNOWN';
 }

 /**
 * Build LLM prompt guard for non-verified sources
 */
 buildPromptGuard(hasNonVerifiedSources: boolean): string {
 if (!hasNonVerifiedSources) {
 return '';
 }

 return `
⚠️ LEGAL CONSTRAINT - NON-GOVERNMENT SOURCES DETECTED

This content includes sources that are NOT from government publications (.gov or court systems).

YOU MUST:
✔ Summarize factual outcomes from similar matters ONLY
✔ Use ONLY for comparative narrative context
✔ Avoid prescriptive language ("should", "must", "obvious violation")

YOU MUST NOT:
❌ Infer guilt or criminal liability
❌ Make charging recommendations
❌ State "defendant should be convicted"
❌ Estimate sentencing before conviction
❌ Use non-gov sources to generate charging logic

Remember: You are providing CONTEXT ONLY, not legal advice or charging authority.
`;
 }

 /**
 * Get disclaimer modal text
 */
 getDisclaimerModal(): string {
 return `⚠️ Non-Government Legal Source Detected

This information is not from a government database. Please confirm accuracy with:
• your local District Attorney
• state Attorney General website
• or official legislative statute system

Use only for context, not charging authority.`;
 }

 /**
 * Record prosecutor acknowledgement
 */
 async recordAcknowledgement(
 citationId: string, sourceVerificationId: string, string
 ): Promise<void> {
 try {
 await db.insert(citationMetadata).values({
 citationId,
 sourceVerificationId: disclaimerRequired,
 prosecutorAcknowledged: true, acknowledgedBy: prosecutorId, new Date().toISOString(),
 });
 } catch (error) {
 console.error('Error recording acknowledgement:', error);
 throw error;
 }
 }

 /**
 * Check if citation requires verification
 */
 async requiresVerification(citationId: string): Promise<boolean> {
 try {
 const [metadata] = await db
 .select()
 .from(citationMetadata)
 .where(eq(citationMetadata.citationId, citationId))
 .limit(1);

 if (!metadata) {
 return false;
 }

 return metadata.disclaimerRequired && !metadata.prosecutorAcknowledged;
 } catch (error) {
 console.error('Error checking verification requirement:', error);
 return false;
 }
 }

 /**
 * Validate AI response against legal constraints
 */
 validateAIResponse(response: string): { valid: boolean; violations: string[] } {
 const violations: string[] = [];

 // Check for prohibited language
 const prohibitedPatterns = [
 /should\s+be\s+convicted/i,
 /defendant\s+is\s+guilty/i,
 /obvious\s+violation/i,
 /clearly\s+violated/i,
 /must\s+charge/i,
 /recommend\s+charging/i,
 /infer\s+guilt/i,
 /estimate\s+sentence/i,
 ];

 for (const pattern of prohibitedPatterns) {
 if (pattern.test(response)) {
 violations.push(`Prohibited language detected: ${pattern.source}`);
 }
 }

 return {
 valid: violations.length === 0,
 violations,
 };
 }
}

export const verificationService = new VerificationService();
