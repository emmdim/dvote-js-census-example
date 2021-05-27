import * as fs from "fs"
const { CensusOffChainApi, CensusOffchainDigestType, Gateway } = require("dvote-js")
const { Wallet } = require("ethers")

const NETWORK_ID = "goerli"
const VOCDONI_ENVIRONMENT = "dev"
const BOOTNODES_URL = "https://bootnodes.vocdoni.net/gateways.dev.json" // The uri from which contains the available gateway

/**
 * TEST WALLET
 * phrase (mnemonic): 'carry digital wear gift share wheel once amount dentist couch beauty jacket'
 * path: "m/44'/60'/0'/0/0"
 * locale: 'en'
 * address: '0xeD6bdA6f0788C1E06C59781Efe5433619C5b4B99'
 * privateKey: '0x8c26c9510ac2f74ed9ae519e024d175cbed74490a84295a993ba3ed0792646a7'
 * publicKey: '0x04049892fcb0273154e09e19b5184bb7d99af647f4743a321523fdee78ed6a7688ac951c4bfdba98ac52754617865509433f9ce84bab6e82ed9e0d421b692d5694'
 */
const WALLET_MNEMONIC = "carry digital wear gift share wheel once amount dentist couch beauty jacket" // The Wallet mnemonic
const PUBLIC_KEYS_FILE = "public_keys.txt" // The relative path and name of the file containing the public keys
const GENERATE_RANDOM_KEYS_NUM = 10 // The number of random generated wallets

let gw: typeof Gateway // The Gateway instance connected to a remote Gateway
let publicKeys: string[] = [] // The list of public keys used to generate claims
const entityWallet = Wallet.fromMnemonic(WALLET_MNEMONIC) // The entity Wallet (creator of the Census)

/**
 * Initialize gateway
 */
async function initGateway() {
    try {
        gw = await Gateway.randomfromUri(NETWORK_ID, BOOTNODES_URL, [], VOCDONI_ENVIRONMENT)
        await gw.init()
    }
    catch (err) {
        console.error("The gateway can't be reached", err)
    }
}

/**
 * Reads file from disk containing the public keys
 */
function loadCensusPublicKeysFromFile() {
    try {
        const strData = fs.readFileSync(__dirname + "/" + PUBLIC_KEYS_FILE).toString()
        for (const line of strData.split(/[\r\n]+/)){
            if(line) {
                publicKeys.push(line)
            }
        }
    } catch (err) {
        console.error("Could not read public keys file", err)
        process.exit(1)
    }
}

/**
 * Creates random wallets and stores it's public key
 *
 * @param num The number of wallets to generate
 */
function generateRandomCensusPublicKeys(num: Number = 10) {
    for (let i = 0; i < num; i++) {
        const wallet = Wallet.createRandom()
        publicKeys.push(wallet.publicKey)
    }
}

/**
 * Populates the census from random wallets or from file containing public keys
 */
function populateCensus() {
    //generateRandomCensusPublicKeys(GENERATE_RANDOM_KEYS_NUM)
    loadCensusPublicKeysFromFile()
    console.log("Found", publicKeys.length, "public keys")
}

/**
 * Asks the Gateway to create a new census, adds the public keys and publishes it
 */
async function publishVoteCensus() {
    // Census parameters
    const censusName = "ExampleCensusName #" + Math.random().toString().substr(2, 6)
    // Public key(s) that can manage this census
    const managerPublicKeys = [entityWallet.publicKey]
    // The list of claims to add (base64 encoded public key)
    const publicKeyClaimsList: { key: string }[] = publicKeys.map(k => (
        { key: CensusOffChainApi.digestPublicKey(k, CensusOffchainDigestType.RAW_PUBKEY) }
    ))

    // Asks the Gateway to create a new census
    let { censusId } = await CensusOffChainApi.addCensus(censusName, managerPublicKeys, entityWallet, gw)
    console.log(`Census added: "${censusName}" with ID ${censusId}`)

    // Add claims to the new census
    let result = await CensusOffChainApi.addClaimBulk(censusId, publicKeyClaimsList, true, entityWallet, gw)
    console.log("Added", publicKeys.length, "claims to", censusId)
    // Show the invalid claims if exist
    if (result.invalidClaims.length > 0) {
        console.error("Invalid claims", result.invalidClaims)
    }

    // Publish the census (make it public)
    const merkleTreeOrigin = await CensusOffChainApi.publishCensus(censusId, entityWallet, gw)
    console.log("Census published on", merkleTreeOrigin)

    // Asks for the merkle root
    const merkleRoot = await CensusOffChainApi.getRoot(censusId, gw)
    console.log("Census Merkle Root:", merkleRoot)
}

async function main() {
    await initGateway()
    populateCensus()
    await publishVoteCensus()
}

main()
    .then(() => console.log("DONE"))
    .catch(err => {
        console.error(err)
        process.exit(1)
    })