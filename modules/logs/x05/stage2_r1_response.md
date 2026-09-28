### FILE: tests/hello_demo/test_greet_all.py
```python
import unittest
from src.hello import greet_all, hello, bye, shout, whisper

class TestGreetAll(unittest.TestCase):
    def test_greet_all_multiple_valid_names(self):
        self.assertEqual(greet_all(['Ana', 'Bo']), ['Hello, Ana', 'Hello, Bo'])

    def test_greet_all_empty_list(self):
        self.assertEqual(greet_all([]), [])

    def test_greet_all_single_space(self):
        self.assertEqual(greet_all([' ']), ['Hello, stranger'])

    def test_greet_all_empty_string(self):
        self.assertEqual(greet_all(['']), ['Hello, stranger'])

    def test_greet_all_whitespace_escape_characters(self):
        self.assertEqual(greet_all(['\t \n']), ['Hello, stranger'])

    def test_greet_all_surrounding_whitespace(self):
        self.assertEqual(greet_all(['  Ana  ']), ['Hello, Ana'])

    def test_greet_all_mixed_items(self):
        self.assertEqual(greet_all(['Ana', ' ', 'Bo']), ['Hello, Ana', 'Hello, stranger', 'Hello, Bo'])

    def test_regression_hello(self):
        self.assertEqual(hello('Ana'), 'Hello, Ana')

    def test_regression_bye(self):
        self.assertEqual(bye('Ana'), 'Bye, Ana')

    def test_regression_shout(self):
        self.assertEqual(shout('Ana'), 'HELLO, ANA!')

    def test_regression_whisper(self):
        self.assertEqual(whisper('Ana'), 'hello, ana...')

if __name__ == '__main__':
    unittest.main()
```