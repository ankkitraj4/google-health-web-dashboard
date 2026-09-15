import '@testing-library/jest-dom/vitest';
import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';

// Unmounts every rendered component after each test — without this, DOM
// nodes from one test's render() are still present when the next test
// queries the document, causing false "multiple elements found" failures.
afterEach(() => {
  cleanup();
});
