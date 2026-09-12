import sys
from pathlib import Path

# Tell Python to look in the main Scanity folder for imports
sys.path.append(str(Path(__file__).parent.parent))

from ai.allergy_engine import check_allergies, overall_verdict

print("=== Test 1: Milk allergy + casein = avoid ===")
flags = check_allergies(["milk"], ["sodium caseinate"])
verdict = overall_verdict(flags)
print(flags)
print("Verdict:", verdict)
assert verdict == "avoid", f"FAILED: expected avoid, got {verdict}"
print("PASS\n")

print("=== Test 2: No milk in list = not avoid ===")
flags = check_allergies(["milk"], ["shrimp", "rice"])
verdict = overall_verdict(flags)
print(flags)
print("Verdict:", verdict)
assert verdict != "avoid", f"FAILED: expected not-avoid, got {verdict}"
print("PASS\n")

print("Both required tests passed.")