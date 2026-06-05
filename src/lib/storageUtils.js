export async function requestPersistentStorage() {
  if (navigator.storage && navigator.storage.persist) {
    await navigator.storage.persist();
  }
}
