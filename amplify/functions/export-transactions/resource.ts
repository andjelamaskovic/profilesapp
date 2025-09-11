// amplify/functions/export-transactions/resource.ts
import { defineFunction } from '@aws-amplify/backend';

export const exportTransactions = defineFunction({
    name: 'export-transactions',
    entry: './handler.ts',
    timeoutSeconds: 60,
    memoryMB: 256,
});
