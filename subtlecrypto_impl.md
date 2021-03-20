# .NET Crypto mapping to SubtleCrypto

This document represents a possible mapping of [SubtleCrypto](https://developer.mozilla.org/docs/Web/API/SubtleCrypto) APIs that can be used to implement the .NET Crypto API. SubtleCrypto is an implementation of the [WebCrypto API](https://www.w3.org/TR/WebCryptoAPI). The WebCrypto API has a table for algorithm support [here](https://www.w3.org/TR/WebCryptoAPI/#algorithm-overview).

### Symmetric encryption
- AES - `SubtleCrypto.encrypt()`, `SubtleCrypto.generateKey()`
    - Supports [AES-CTR, AES-CBC, AES-GCM, AES-KW](https://developer.mozilla.org/docs/Web/API/AesKeyGenParams)
    - For AES-CBC the only available padding is [PKCS#7](https://www.w3.org/TR/WebCryptoAPI/#aes-cbc).
- TripleDES - **Not supported**
- RC2 - ?
- DES - **Not supported**

### Asymmetric cryptography
- RSA - `SubtleCrypto.encrypt()`
    - Supports [RSA-OAEP](https://developer.mozilla.org/docs/Web/API/SubtleCrypto/encrypt#supported_algorithms).
- ECDsa - `SubtleCrypto.encrypt()`
- ECDiffieHellman - ?
- DSA - ?

### Hashing
- MD5 - **Not supported**
- SHA1 - `SubtleCrypto.digest()`
- SHA256 - `SubtleCrypto.digest()`
- SHA384 - `SubtleCrypto.digest()`
- SHA512 - `SubtleCrypto.digest()`
- HMAC - `SubtleCrypto.sign()`, `SubtleCrypto.generateKey()`
    - Supports [SHA1, SHA256, SHA384, SHA512](https://developer.mozilla.org/docs/Web/API/HmacKeyGenParams)

### Other
- RandomNumberGenerator - [`Crypto.getRandomValues()`](https://developer.mozilla.org/docs/Web/API/Crypto/getRandomValues).