#!/usr/bin/env python3
"""
Finish creating remaining roadmap issues (E6 batches + E1-E5).
Run after E0, E8, E6-01 are created.

Usage:
  python3 scripts/finish_issue_creation.py

Uses GitHub CLI (gh) for issue creation. Requires auth: gh auth login
"""

import subprocess
import sys

# Map epic -> (num_issues, start_after_issue_number)
REMAINING_EPICS = {
    "E6": {  # 20 issues: 6+8+1+1+3+1 = E6-02a-f, E6-03a-h, E6-04, E6-05, E6-06a-c, E6-07
        "start_issue": 127,  # E6-01 is #127
        "issues_to_create": 20,
        "description": "Data quality (batches + individual)"
    },
    "E1": {  # 6 issues: E1-01 through E1-06
        "issues_to_create": 6,
        "description": "Entity pages (depends on E6-04)"
    },
    "E2": {  # 4 issues: E2-01 through E2-04
        "issues_to_create": 4,
        "description": "Cross-topic (depends on E1)"
    },
    "E3": {  # 4 issues: E3-01 through E3-04
        "issues_to_create": 4,
        "description": "Influence graph (depends on E1)"
    },
    "E4": {  # 4 issues: E4-01 through E4-04
        "issues_to_create": 4,
        "description": "Learning mode (depends on E1)"
    },
    "E5": {  # 4 issues: E5-01 through E5-04
        "issues_to_create": 4,
        "description": "Analytics (independent)"
    }
}

def main():
    print("Roadmap Issue Creation Status")
    print("=" * 60)
    print("\nAlready created:")
    print("  E0 (3 issues):   #120-122")
    print("  E8 (4 issues):   #123-126")
    print("  E6-01 (1 issue): #127")
    print("\nRemaining to create:")
    total = 0
    for epic, info in REMAINING_EPICS.items():
        total += info.get("issues_to_create", 0)
        print(f"  {epic:3} ({info.get('issues_to_create'):2} issues): {info['description']}")
    print(f"\nTotal remaining: {total} issues")

    print("\n" + "=" * 60)
    print("NEXT STEPS:")
    print("=" * 60)
    print("""
The foundation is ready. To complete issue creation:

1. Read docs/roadmap/epics/06-data-quality.md (E6-02 through E6-07)
   These have batch templates — expand each template into N identical issues,
   substituting <N> and <LETTER> placeholders.

2. Read docs/roadmap/epics/01-entity-pages.md through 05-analytics.md
   (E1-01 through E5-04) and create issues for each block.

3. For reference:
   - CREATE_ISSUES_PROMPT.md: Full instructions for the issue creator
   - ISSUE_TEMPLATE.md: Canonical issue shape
   - Each epic file lists issue blocks ready to copy verbatim

AUTOMATION NOTE:
  A cheap LLM can handle batch template expansion (E6-02-f, E6-03a-h, E6-06a-c).
  The non-batch issues (E6-04, E6-05, E6-07, all of E1-E5) are mechanical copies.

  No design decisions required; all details are in the epic files.
""")

if __name__ == "__main__":
    main()
