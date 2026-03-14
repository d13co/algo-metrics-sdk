# algo-metrics-sdk

Monorepo for Algorand block metrics, powered by [Abel Ghost SDK](https://www.npmjs.com/package/abel-ghost-sdk).

| Package | Version | Description |
| --- | --- | --- |
| [`@d13co/algo-metrics-sdk`](./packages/sdk) | [![npm](https://img.shields.io/npm/v/@d13co/algo-metrics-sdk)](https://www.npmjs.com/package/@d13co/algo-metrics-sdk) | Core SDK — one-shot queries and live sliding-window watchers |
| [`@d13co/algo-metrics-react`](./packages/react) | [![npm](https://img.shields.io/npm/v/@d13co/algo-metrics-react)](https://www.npmjs.com/package/@d13co/algo-metrics-react) | React hooks wrapping the SDK with a single shared watcher |

## Development

```bash
pnpm install
pnpm run build
pnpm run test
pnpm run lint
```

## License

MIT
