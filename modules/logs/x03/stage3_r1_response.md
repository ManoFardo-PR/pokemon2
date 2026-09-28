### PATCH: tests/hello_demo/src/hello.py
<<<<<<< SEARCH
def bye(name: str) -> str:
    cleaned = name.strip()
    if not cleaned:
        return "Bye, stranger"
    return f"Bye, {cleaned}"
=======
def bye(name: str) -> str:
    cleaned = name.strip()
    if not cleaned:
        return "Bye, stranger"
    return f"Bye, {cleaned}"

def shout(name: str) -> str:
    return f"{hello(name)}!".upper()
>>>>>>> REPLACE