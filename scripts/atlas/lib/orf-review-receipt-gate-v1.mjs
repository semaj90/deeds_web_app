/** ORF review binding preflight only. Not an approval authority.
 * TODO: inject existing authoritative trusted-review verifier at runtime.
 * TODO: recompute checksum with the actual ORF builder before promotion.
 */
export function inspectOrfReviewBindingV1({registry,receipt,trustResult}={}) {
 const blocked=reason=>({schema:'atlas.orf-review-binding.v1',status:'BLOCKED',reason,runtimeEligible:false});
 if(!registry?.registry_revision||!/^[a-f0-9]{64}$/.test(registry.registry_checksum??''))return blocked('REGISTRY_MISSING');
 if(receipt?.registry_revision!==registry.registry_revision||receipt?.registry_checksum!==registry.registry_checksum)return blocked('REVIEW_UNBOUND');
 if(receipt.decision!=='APPROVED')return blocked('REVIEW_NOT_APPROVED');
 if(trustResult?.verified!==true||trustResult?.registryChecksum!==registry.registry_checksum||trustResult?.reviewerId!==receipt.reviewer_id||trustResult?.receiptChecksum!==receipt.receipt_checksum||trustResult?.authorizedFor!=='ORF_REGISTRY'||trustResult?.revoked!==false)return blocked('TRUST_UNVERIFIED');
 return {schema:'atlas.orf-review-binding.v1',status:'EXTERNAL_BINDING_PRESENT',runtimeEligible:false,reason:'RUNTIME_VERIFIER_NOT_CONNECTED'};
}
