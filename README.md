# .NET Synchronous API using WASM Promises based API

Much of the .NET API surface remains synchronous in nature. This does not lend itself to being implemented against a run time that is built on an asynchronous model. A primary example is the [.NET Crypto API][net_crypto_api_link] which would ideally be implemented using the [SubtleCrypto](https://developer.mozilla.org/docs/Web/API/SubtleCrypto) API. However the SubtleCrypto API is entirely [`Promise`](https://developer.mozilla.org/docs/Web/JavaScript/Reference/Global_Objects/Promise) based and thus makes implementing the existing synchronous .NET Crypto API difficult.

## Solutions

There are several possible solutions.

### Offload async API calls to WebWorker

This approach is demonstrated in this repo and a pure JavaScript solution can be found in [`src/main.html`](./src/main.html). See comments in `main.html` for how to run the demo. The overall mechanism for enabling this using WebWorkers is conceptually simple.

1) Initialize the WebWorker and send over a small communication buffer for coordination and a larger message buffer to share data.
2) When the main thread wants to make a request the message buffer is populated with data and the communication buffer is used to signal a request.
3) Once the main thread has indicated its request it will spin, waiting on a value in the communication buffer.
4) The WebWorker will read the message, perform the `Promise` based request, serialize the results and write them back to the message buffer, and then signal back to the main thread a state change.
5) The main thread can then read the results and return in a synchronous fashion.

This is not an efficient mechanism but does make sync-over-async possible. Aside from efficiency, there are additional draw backs to this solution.

- Some required APIs are not availabe on all browsers and thus this is a limited solution - e.g., [`SharedArrayBuffer`](https://developer.mozilla.org/docs/Web/JavaScript/Reference/Global_Objects/SharedArrayBuffer) is not available on the Safari browser at the time of this writing.
- The communication model is relatively simple as a demo but does impose complexity in practice. Sharing large messages using shared memory coordination is non-trivial.
- Exception handling across the communication channel is difficult and could result in deadlocks unless care is taken.

### New async .NET APIs

Exposing new async APIs would enable support and integrate well with the WASM model. A drawback here is this would create a new suite of APIs that may only exist on the WASM TFM. Additionally, reviewing a new set of async APIs in any area represents a big lift for the API review team especially if the use model is intended to change. Even if new APIs are introduced questions around compatibility and existing code transition could negatively impact existing consumers. It is assumed customers would like to simply retarget their code to WASM and not have to rewrite it using special APIs.

### Add Mono run time support for Asyncify

A solution for this problem does exist when coming from the C or C++ environment - [Asyncify][asyncify_link]. This solution is designed to help convert asynchronous calls into synchronous calls during compilation with [Emscripten](https://kripken.github.io/blog/wasm/2019/07/16/asyncify.html). This would appear to be an excellent option but does come with some large upfront cost. Since the WASM scenario in .NET is using an existing .NET runtime (i.e. mono), that runtime would need to be imbued with knowledge to help cooridnate with the Asyncify generated code. The [Julia](https://github.com/JuliaLang) run time has paid this cost and can be seen [here](https://github.com/JuliaLang/julia/pull/32532).

## Relevant GitHub Issues

- Enable Crypto APIs on Blazor: https://github.com/dotnet/runtime/issues/40074
- Proposal for async .NET hashing functions: https://github.com/dotnet/runtime/issues/43939
- Enable Crypto tests on WASM: https://github.com/dotnet/runtime/issues/37669
- Support Asyncify: https://github.com/dotnet/runtime/issues/48713

## References

[Asyncify][asyncify_link].

[.NET Crypto API][net_crypto_api_link].

<!-- Links -->
[net_crypto_api_link]: https://docs.microsoft.com/dotnet/standard/security/cryptography-model
[asyncify_link]: https://emscripten.org/docs/porting/asyncify.html