export const EVOLUTION_POLICY_VERSION="1.0";

export const CHANGE_CLASSES=Object.freeze({
  SAFE_PATCH:"SAFE_PATCH",
  PERFORMANCE:"PERFORMANCE",
  SECURITY_HARDENING:"SECURITY_HARDENING",
  OBSERVABILITY:"OBSERVABILITY",
  SCHEMA_MIGRATION:"SCHEMA_MIGRATION",
  AUTH_IDENTITY:"AUTH_IDENTITY",
  ECONOMICS:"ECONOMICS",
  TREASURY:"TREASURY",
  MAINNET:"MAINNET",
  SECRETS:"SECRETS",
  CRYPTOGRAPHY:"CRYPTOGRAPHY"
});

const AUTO_ALLOWED=new Set([
  CHANGE_CLASSES.SAFE_PATCH,
  CHANGE_CLASSES.PERFORMANCE,
  CHANGE_CLASSES.SECURITY_HARDENING,
  CHANGE_CLASSES.OBSERVABILITY
]);

export function classifyEvolutionChange(input={}){
  const tags=new Set((Array.isArray(input.tags)?input.tags:[]).map(x=>String(x).toUpperCase()));
  if(tags.has("MAINNET")) return CHANGE_CLASSES.MAINNET;
  if(tags.has("TREASURY")) return CHANGE_CLASSES.TREASURY;
  if(tags.has("SECRET")||tags.has("SECRETS")||tags.has("KEY_ROTATION")) return CHANGE_CLASSES.SECRETS;
  if(tags.has("TOKENOMICS")||tags.has("ECONOMICS")||tags.has("MINING_ECONOMICS")) return CHANGE_CLASSES.ECONOMICS;
  if(tags.has("AUTH")||tags.has("IDENTITY")||tags.has("HUMAN_PROOF")) return CHANGE_CLASSES.AUTH_IDENTITY;
  if(tags.has("SCHEMA")||tags.has("MIGRATION")||tags.has("PERSISTENCE_FORMAT")) return CHANGE_CLASSES.SCHEMA_MIGRATION;
  if(tags.has("CRYPTO")||tags.has("CRYPTOGRAPHY")) return CHANGE_CLASSES.CRYPTOGRAPHY;
  if(tags.has("PERFORMANCE")) return CHANGE_CLASSES.PERFORMANCE;
  if(tags.has("SECURITY")) return CHANGE_CLASSES.SECURITY_HARDENING;
  if(tags.has("OBSERVABILITY")) return CHANGE_CLASSES.OBSERVABILITY;
  return CHANGE_CLASSES.SAFE_PATCH;
}

export function evaluateEvolutionGate(input={}){
  const changeClass=classifyEvolutionChange(input);
  const checks={
    testsPassed:input.testsPassed===true,
    securityPassed:input.securityPassed===true,
    rollbackDefined:input.rollbackDefined===true,
    dataLossRisk:input.dataLossRisk===true,
    irreversible:input.irreversible===true,
    changesPersistentSchema:input.changesPersistentSchema===true,
    changesEconomics:input.changesEconomics===true,
    changesAuthority:input.changesAuthority===true,
    changesSecrets:input.changesSecrets===true,
    touchesMainnet:input.touchesMainnet===true
  };

  const hardStop=
    checks.dataLossRisk ||
    checks.irreversible ||
    checks.changesPersistentSchema ||
    checks.changesEconomics ||
    checks.changesAuthority ||
    checks.changesSecrets ||
    checks.touchesMainnet ||
    !AUTO_ALLOWED.has(changeClass);

  const automaticEligible=
    !hardStop &&
    checks.testsPassed &&
    checks.securityPassed &&
    checks.rollbackDefined;

  return {
    version:EVOLUTION_POLICY_VERSION,
    changeClass,
    automaticEligible,
    requiresHumanApproval:!automaticEligible,
    checks,
    reason:automaticEligible
      ?"LOW_RISK_REVERSIBLE_VERIFIED"
      :hardStop
        ?"HIGH_IMPACT_OR_IRREVERSIBLE"
        :"VERIFICATION_INCOMPLETE"
  };
}

export const CRYPTO_AGILITY_POLICY=Object.freeze({
  hash:["SHA-256","SHA-512"],
  passwordKdf:["scrypt"],
  signatures:["Ed25519/Solana"],
  requirements:[
    "algorithm identifiers are versioned",
    "new algorithms require compatibility tests",
    "migration must preserve verification of historical records",
    "deprecated algorithms are removed only after staged migration",
    "no proprietary secrecy is treated as a security boundary"
  ]
});
