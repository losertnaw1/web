module.exports = {
  extends: [
    'react-app',
    'react-app/jest'
  ],
  rules: {
    // Disable warnings that are not critical
    '@typescript-eslint/no-unused-vars': 'warn',
    'react-hooks/exhaustive-deps': 'warn',
    'no-console': 'off',
    'prefer-const': 'warn',
    'no-var': 'warn',
    
    // Allow any type for rapid development
    '@typescript-eslint/no-explicit-any': 'off',
    
    // Allow empty interfaces
    '@typescript-eslint/no-empty-interface': 'off',
    
    // Allow unused parameters with underscore
    '@typescript-eslint/no-unused-vars': [
      'warn',
      {
        'argsIgnorePattern': '^_',
        'varsIgnorePattern': '^_'
      }
    ]
  }
};
