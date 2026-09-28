### FILE: tests/hello_demo/test_shout.py
```python
import unittest
from src.hello import shout, hello, bye

class TestShout(unittest.TestCase):
    def test_shout_valid_name(self):
        self.assertEqual(shout('Ana'), 'HELLO, ANA!')

    def test_shout_empty_or_whitespace_only(self):
        self.assertEqual(shout(''), 'HELLO, STRANGER!')
        self.assertEqual(shout('   '), 'HELLO, STRANGER!')
        self.assertEqual(shout('\t \n'), 'HELLO, STRANGER!')

    def test_shout_trims_surrounding_whitespace(self):
        self.assertEqual(shout('  bo '), 'HELLO, BO!')
        self.assertEqual(shout('  Ana'), 'HELLO, ANA!')
        self.assertEqual(shout('Ana  '), 'HELLO, ANA!')

    def test_hello_and_bye_regression(self):
        self.assertEqual(hello('Ana'), 'Hello, Ana')
        self.assertEqual(bye('Ana'), 'Bye, Ana')

if __name__ == '__main__':
    unittest.main()
```