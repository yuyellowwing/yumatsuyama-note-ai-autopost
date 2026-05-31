import _sodium from "libsodium-wrappers";

await _sodium.ready;
const sodium = _sodium;

const [,, pubKeyB64, secretValue] = process.argv;
const pubKey = sodium.from_base64(pubKeyB64, sodium.base64_variants.ORIGINAL);
const secretBytes = sodium.from_string(secretValue);
const encrypted = sodium.crypto_box_seal(secretBytes, pubKey);
console.log(sodium.to_base64(encrypted, sodium.base64_variants.ORIGINAL));
