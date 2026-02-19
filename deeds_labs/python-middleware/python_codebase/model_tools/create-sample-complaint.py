#!/usr/bin/env python3
"""
Create a sample legal complaint PDF for RAG demonstration
"""

from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import getSampleStyleSheet
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer
from datetime import datetime

def create_sample_complaint():
    """Create a sample legal complaint PDF"""

    # Create PDF document
    doc = SimpleDocTemplate("complaint.pdf", pagesize=letter)
    story = []
    styles = getSampleStyleSheet()

    # Title
    title = Paragraph("COMPLAINT FOR DAMAGES", styles['Title'])
    story.append(title)
    story.append(Spacer(1, 20))

    # Case header
    case_header = """
    IN THE UNITED STATES DISTRICT COURT
    FOR THE NORTHERN DISTRICT OF CALIFORNIA

    ACME TECHNOLOGY CORP.,
                                    Plaintiff,
    v.                              Case No. 23-cv-12345

    BETA SOFTWARE SOLUTIONS, INC.,
                                    Defendant.
    """

    header_para = Paragraph(case_header, styles['Normal'])
    story.append(header_para)
    story.append(Spacer(1, 20))

    # Complaint content
    complaint_text = """
    TO THE HONORABLE COURT:

    Plaintiff ACME Technology Corp. ("ACME"), by and through its undersigned counsel,
    hereby complains against Defendant Beta Software Solutions, Inc. ("Beta") and alleges as follows:

    PARTIES

    1. Plaintiff ACME is a Delaware corporation with its principal place of business in
    San Francisco, California. ACME develops and licenses advanced software solutions
    for enterprise customers.

    2. Upon information and belief, Defendant Beta is a corporation organized under the
    laws of Nevada with its principal place of business in Las Vegas, Nevada. Beta
    provides software development and consulting services.

    JURISDICTION AND VENUE

    3. This Court has subject matter jurisdiction over this action pursuant to 28 U.S.C. § 1332
    because the matter in controversy exceeds $75,000 and there is complete diversity of
    citizenship between the parties.

    4. Venue is proper in this District pursuant to 28 U.S.C. § 1391(b) because a substantial
    part of the events giving rise to the claim occurred in this District.

    FACTUAL ALLEGATIONS

    5. On or about January 15, 2023, ACME and Beta entered into a Software Development
    Agreement ("Agreement") whereby Beta agreed to develop custom software modules for
    ACME's flagship product.

    6. Under the terms of the Agreement, Beta was to deliver the completed software modules
    by June 30, 2023, in exchange for payment of $500,000.

    7. The Agreement contained strict confidentiality provisions prohibiting Beta from
    disclosing ACME's proprietary algorithms and trade secrets to any third parties.

    8. ACME made timely payments totaling $350,000 to Beta in accordance with the
    Agreement's milestone-based payment schedule.

    9. Beta failed to deliver the software modules by the contractual deadline and has
    repeatedly requested extensions without providing adequate justification.

    10. Upon information and belief, Beta has improperly disclosed ACME's confidential
    information to competing companies, including ACME's proprietary machine learning
    algorithms and customer data.

    11. Beta's breach of contract and misappropriation of trade secrets has caused ACME
    to lose substantial business opportunities and suffer damages in excess of $2,000,000.

    COUNT I - BREACH OF CONTRACT

    12. ACME incorporates by reference the allegations contained in paragraphs 1-11.

    13. The Agreement constitutes a valid and enforceable contract between ACME and Beta.

    14. ACME has performed all of its obligations under the Agreement, including making
    timely payments to Beta.

    15. Beta has materially breached the Agreement by failing to deliver the software
    modules by the contractual deadline and by failing to meet the technical specifications
    set forth in the Agreement.

    16. As a direct and proximate result of Beta's breach, ACME has suffered damages
    including the amounts paid to Beta, costs of finding alternative development resources,
    and lost profits.

    COUNT II - MISAPPROPRIATION OF TRADE SECRETS

    17. ACME incorporates by reference the allegations contained in paragraphs 1-16.

    18. ACME's algorithms, customer lists, and technical specifications constitute valuable
    trade secrets that derive independent economic value from not being generally known.

    19. ACME took reasonable measures to maintain the secrecy of this information, including
    requiring Beta to execute confidentiality agreements.

    20. Beta has misappropriated ACME's trade secrets by disclosing them to third parties
    without authorization and by using them for Beta's own benefit.

    21. Beta's misappropriation has caused irreparable harm to ACME and entitles ACME
    to injunctive relief and monetary damages.

    PRAYER FOR RELIEF

    WHEREFORE, Plaintiff ACME Technology Corp. respectfully requests that this Court:

    A. Enter judgment in favor of ACME and against Beta on all counts;

    B. Award ACME compensatory damages in an amount to be proven at trial, but not
    less than $2,000,000;

    C. Award ACME its reasonable attorneys' fees and costs incurred in this action;

    D. Grant such other and further relief as this Court deems just and proper.

    DEMAND FOR JURY TRIAL

    Plaintiff demands a trial by jury on all issues so triable.

    Respectfully submitted,

    /s/ Attorney Name
    Attorney Name (State Bar No. 123456)
    LAW FIRM NAME
    123 Legal Street
    San Francisco, CA 94105
    Telephone: (415) 555-0123
    Email: attorney@lawfirm.com

    Attorney for Plaintiff ACME Technology Corp.
    """

    # Add content to PDF
    for paragraph in complaint_text.split('\n\n'):
        if paragraph.strip():
            para = Paragraph(paragraph.strip(), styles['Normal'])
            story.append(para)
            story.append(Spacer(1, 12))

    # Build PDF
    doc.build(story)
    print("✅ Created complaint.pdf")

if __name__ == "__main__":
    try:
        create_sample_complaint()
    except ImportError:
        print("❌ reportlab not installed. Installing...")
        import subprocess
        subprocess.check_call(["pip", "install", "reportlab"])
        create_sample_complaint()