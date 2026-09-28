### PATCH: tests/hello_demo/src/hello.py
<<<<<<< SEARCH
def whisper(name: str) -> str:
    return f"{hello(name).lower()}..."
=======
def whisper(name: str) -> str:
    return f"{hello(name).lower()}..."

def greet_all(names: list[str]) -> list[str]:
    return [hello(name) for name in names]
>>>>>>> REPLACE