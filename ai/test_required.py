import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from ai.allergy_engine import check_allergies, overall_verdict


def check(name, condition):
    status = "PASS" if condition else "FAIL"
    print(f"[{status}] {name}")
    if not condition:
        raise AssertionError(name)


print("=== Original required tests ===")
flags = check_allergies(["milk"], ["sodium caseinate"])
check("Milk allergy + casein = avoid", overall_verdict(flags) == "avoid")

flags = check_allergies(["milk"], ["shrimp", "rice"])
check("No milk in list = not avoid", overall_verdict(flags) != "avoid")

print("\n=== Reported false-safe cases (now fixed) ===")

flags = check_allergies(["dairy"], ["sodium caseinate"])
check('"dairy" + sodium caseinate = avoid (synonym match)', overall_verdict(flags) == "avoid")

flags = check_allergies(["tree nuts"], ["almond"])
check('"tree nuts" + almond = avoid (synonym match, lowercase)', overall_verdict(flags) == "avoid")

flags = check_allergies(["Tree Nuts"], ["almond"])
check('"Tree Nuts" + almond = avoid (synonym match, mixed case)', overall_verdict(flags) == "avoid")

flags = check_allergies(["soybeans"], ["tofu"])
check('"soybeans" + tofu = avoid (synonym match)', overall_verdict(flags) == "avoid")

flags = check_allergies(["milk"], [])
check("Empty ingredient list != safe", overall_verdict(flags) != "safe")

flags = check_allergies(["milk"], [None, 123, "sodium caseinate"])
check("Non-string entries do not crash, casein still caught", overall_verdict(flags) == "avoid")

print("\n=== Tighter tests (per reviewer follow-up notes) ===")

flags = check_allergies(["milk"], ["shrimp", "almond"])
check("Fully mapped non-milk product = genuinely safe", overall_verdict(flags) == "safe")

flags = check_allergies(["milk"], ["rice"])
check("Unmapped ingredient = caution", overall_verdict(flags) == "caution")

flags = check_allergies(["milk"], ["sodium caseinate", "rice"])
check("Avoid beats caution in precedence", overall_verdict(flags) == "avoid")

print("\nAll tests passed.")