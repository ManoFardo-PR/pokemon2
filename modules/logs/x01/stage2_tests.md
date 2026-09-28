### FILE: tests/hello_demo/test_hello.py
```python
import unittest
from src.hello import hello

class TestHello(unittest.TestCase):
    def test_hello_valid_name(self):
        self.assertEqual(hello("Ana"), "Hello, Ana")
        self.assertEqual(hello("World"), "Hello, World")

    def test_hello_empty_or_whitespace_only(self):
        self.assertEqual(hello(""), "Hello, stranger")
        self.assertEqual(hello(" "), "Hello, stranger")
        self.assertEqual(hello("   "), "Hello, stranger")
        self.assertEqual(hello("\t \n"), "Hello, stranger")

    def test_hello_trims_surrounding_whitespace(self):
        self.assertEqual(hello("  Ana"), "Hello, Ana")
        self.assertEqual(hello("Ana  "), "Hello, Ana")
        self.assertEqual(hello("  Ana  "), "Hello, Ana")
        self.assertEqual(hello("  Ana Maria  "), "Hello, Ana Maria")

if __name__ == "__main__":
    unittest.main()
```