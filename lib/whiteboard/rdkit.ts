/**
 * RDKit in the browser: the one thing that can say two SMILES are the same molecule.
 *
 * It is 7 MB of WebAssembly, so it comes from the CDN at a pinned version rather than
 * through the bundler (the worksheet takes its pdf.js worker the same way), and only
 * when a page asks for it.
 */
import type { RawKeyEntry } from "./answer-keys";
import type { KeyEntry } from "./structure-key";

const RDKIT_BASE = "https://unpkg.com/@rdkit/rdkit@2026.3.6/dist/";

interface RDKitMol {
  get_smiles(): string;
  get_svg(w: number, h: number): string;
  delete(): void;
}
export interface RDKit {
  get_mol(smiles: string): RDKitMol | null;
}
declare global {
  interface Window {
    initRDKitModule?: (opts: { locateFile: (file: string) => string }) => Promise<RDKit>;
  }
}

let loading: Promise<RDKit> | null = null;

/** Resolves to the one shared module. Safe to call from every mount. */
export function loadRDKit(): Promise<RDKit> {
  loading ??= new Promise<RDKit>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = `${RDKIT_BASE}RDKit_minimal.js`;
    script.onload = () => {
      const init = window.initRDKitModule;
      if (!init) return reject(new Error("RDKit loaded without its initialiser."));
      init({ locateFile: (file) => RDKIT_BASE + file }).then(resolve, reject);
    };
    script.onerror = () => reject(new Error("Couldn't load RDKit."));
    document.head.appendChild(script);
  }).catch((e) => {
    // Let a later call try again instead of caching the failure forever.
    loading = null;
    throw e;
  });
  return loading;
}

/** RDKit's own spelling of a molecule and a drawing of it, or nulls when the SMILES is
 *  not a valid molecule (a five-bond carbon, say). */
export function depict(rdkit: RDKit, smiles: string | null, w = 220, h = 160): { canonical: string | null; svg: string | null } {
  const mol = smiles ? rdkit.get_mol(smiles) : null;
  if (!mol) return { canonical: null, svg: null };
  try {
    return { canonical: mol.get_smiles(), svg: mol.get_svg(w, h) };
  } finally {
    mol.delete();
  }
}

/** A key as written in its file, respelled so it can be compared at all. */
export function canonicalKey(rdkit: RDKit, raw: RawKeyEntry[]): KeyEntry[] {
  return raw.flatMap((a) => {
    const smiles = depict(rdkit, a.smiles).canonical;
    if (!smiles) return [];
    const commonWrong = (a.commonWrong ?? []).flatMap((w) => {
      const wrong = depict(rdkit, w.smiles).canonical;
      return wrong ? [{ name: w.name, smiles: wrong }] : [];
    });
    return [{ problem: a.problem, name: a.name, smiles, commonWrong }];
  });
}
