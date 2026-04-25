const ERROR_PATTERNS = {
  TS001: {
    name: 'Type annotation with comma instead of pipe',
    severity: 'HIGH',
    regex: /(?:const|let|var|function|\w+\s*:\s*)\w+\s*:\s*[^|]*,\s*\w+/g,
    description: 'Type union using comma instead of pipe: Type1, Type2',
    example: 'const x: string, number = 5;'
  }
};

console.log('Testing regex...');
try {
  const testString = 'const x: string, number = 5;';
  console.log('Test string:', testString);

  // Test the original regex without global flag
  const regex = /(?:const|let|var|function|\w+\s*:\s*)\w+\s*:\s*[^|]*,\s*\w+/;
  const matches = testString.match(regex);
  console.log('Original regex (no global) matches:', matches);

  // Test with exec
  const execResult = regex.exec(testString);
  console.log('Regex exec result:', execResult);

} catch (error) {
  console.error('Regex error:', error.message);
}