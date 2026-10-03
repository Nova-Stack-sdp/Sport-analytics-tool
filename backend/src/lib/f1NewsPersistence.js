import { getFirestore } from './firebaseAdmin.js';

const COLLECTION = 'newsFeeds';
const DOCUMENT = 'formula1';

function cleanArticle(article) {
  return {
    id: String(article.id),
    title: String(article.title || ''),
    summary: String(article.summary || ''),
    url: String(article.url || ''),
    imageUrl: article.imageUrl || null,
    publishedAt: article.publishedAt || null,
    category: String(article.category || 'Formula 1'),
    source: String(article.source || 'Formula 1 News'),
  };
}

export function createFirestoreNewsStore({
  getFirestoreImpl = getFirestore,
  now = () => new Date(),
} = {}) {
  let documentRef;

  const document = () => {
    if (!documentRef) {
      documentRef = getFirestoreImpl().collection(COLLECTION).doc(DOCUMENT);
    }
    return documentRef;
  };

  const read = async () => {
    try {
      const snapshot = await document().get();
      if (!snapshot.exists) return null;
      const data = snapshot.data() || {};
      return {
        items: Array.isArray(data.items) ? data.items.map(cleanArticle) : [],
        lastUpdated: data.lastUpdated || null,
        persistedAt: data.persistedAt || null,
      };
    } catch {
      // News still works from the providers when Firestore is unavailable or
      // is not configured in a local/test environment.
      return null;
    }
  };

  const write = async (payload, { limit = 30 } = {}) => {
    const persistedAt = now().toISOString();
    const record = {
      items: (payload.items || []).slice(0, limit).map(cleanArticle),
      lastUpdated: payload.lastUpdated || persistedAt,
      persistedAt,
      source: payload.source || 'Formula 1 News',
      sourceUrls: Array.isArray(payload.sourceUrls) ? payload.sourceUrls : [],
    };

    try {
      await document().set(record);
      return { saved: true, persistedAt, count: record.items.length };
    } catch (error) {
      return {
        saved: false,
        persistedAt: null,
        count: 0,
        error: error instanceof Error ? error.message : 'Firestore news save failed',
      };
    }
  };

  return { read, write };
}

export const firestoreNewsStore = createFirestoreNewsStore();
