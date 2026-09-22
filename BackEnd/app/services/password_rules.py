"""Scanity password rule: 8 or more characters, and at least one number.

Any other characters are allowed, including a password made only of numbers.
"""


def password_issue(password: str) -> str | None:
    if not password:
        return "Password is required."
    if len(password) < 8:
        return "Password must be at least 8 characters."
    if not any(character.isdigit() for character in password):
        return "Password must contain at least 1 number."
    return None
