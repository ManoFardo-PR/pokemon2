### FILE: tests/hello_demo/src/__init__.py
```python
```

### FILE: tests/hello_demo/src/hello.py
```python
def hello(name: str) -> str:
    cleaned = name.strip()
    if not cleaned:
        return "Hello, stranger"
    return f"Hello, {cleaned}"
```