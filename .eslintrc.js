module.exports = {
    "extends": ["eslint:recommended", "google"],
    "env": {
        "node": true,
        "es6": true
    },
    "rules": {
        "no-invalid-this": "warn",
        "no-console": "off",
        "max-len": "off",
        "require-jsdoc": "off",
        "one-var": "warn",
        "one-var-declaration-per-line": "error",
        "curly": "warn",
        "eqeqeq": ["warn", "smart"],
        "block-spacing": ["warn", "never"],
        "comma-dangle": ["error", "never"],
        "indent": "error",
        "arrow-body-style": "error",
        "arrow-spacing": "error",
        "prefer-const": "error"
    }
};