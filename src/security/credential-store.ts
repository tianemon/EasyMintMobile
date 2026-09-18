import * as SecureStore from 'expo-secure-store';
import type { PcCredential } from '../protocol/types';

const KEY = 'easymint.pc-credential.v1';

export async function loadCredential(): Promise<PcCredential | null> {
  const value = await SecureStore.getItemAsync(KEY);
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as PcCredential;
    return parsed.version === 1 && parsed.pcId && parsed.sharedSecret ? parsed : null;
  } catch {
    return null;
  }
}

export async function saveCredential(credential: PcCredential): Promise<void> {
  await SecureStore.setItemAsync(KEY, JSON.stringify(credential), {
    keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
  });
}

export async function clearCredential(): Promise<void> {
  await SecureStore.deleteItemAsync(KEY);
}
