# Run All Tests and Fix Failures

## Overview

Execute the full test suite and systematically fix any failures, ensuring code quality and functionality.

## Steps

1. **Run test suite**
   - Execute all tests in the project
   - Capture output and identify failures
   - Check both unit and integration tests
   - You can run it using example command:

```
cd /Users/onezee/telegram-stars-market-bot && ./node_modules/.bin/jest --config ./test/jest.config.e2e.js --testPathPattern="daily-checkin.e2e.spec.ts" --testNamePattern="watchAd" --forceExit
```

2. **Analyze failures**
   - Categorize by type: flaky, broken, new failures
   - Prioritize fixes based on impact
   - Check if failures are related to recent changes

3. **Fix issues systematically**
   - Start with the most critical failures
   - Fix one issue at a time
   - Re-run tests after each fix
