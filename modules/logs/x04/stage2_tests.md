### FILE: tests/hello_demo/test_whisper.py
```python
import unittest
from src.hello import whisper, hello, bye, shout

class TestWhisper(unittest.TestCase):
    def test_whisper_valid_name(self):
        self.assertEqual(whisper('Ana'), 'hello, ana...')

    def test_whisper_empty_string(self):
        self.assertEqual(whisper(''), 'hello, stranger...')

    def test_whisper_spaces_only(self):
        self.assertEqual(whisper('   '), 'hello, stranger...')

    def test_whisper_whitespace_characters_only(self):
        self.assertEqual(whisper('\t \n'), 'hello, stranger...')

    def test_whisper_leading_whitespace(self):
        self.assertEqual(whisper('  Ana'), 'hello, ana...')

    def test_whisper_trailing_whitespace(self):
        self.assertEqual(whisper('Ana  '), 'hello, ana...')

    def test_whisper_mixed_case_with_whitespace(self):
        self.assertEqual(whisper('  bo '), 'hello, bo...')

    def test_regression_shout(self):
        self.assertEqual(shout('Ana'), 'HELLO, ANA!')

    def test_regression_hello(self):
        self.assertEqual(hello('Ana'), 'Hello, Ana')

    def test_regression_bye(self):
        self.assertEqual(bye('Ana'), 'Bye, Ana')

if __name__ == '__main__':
    unittest.main()
```