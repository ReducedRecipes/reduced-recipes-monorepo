import { proxyToFirebaseAuth } from '../../../src/lib/firebase-proxy';

export const onRequest: PagesFunction = ({ request }) => proxyToFirebaseAuth(request);
