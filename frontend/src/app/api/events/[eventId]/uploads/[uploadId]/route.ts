import { ApiError } from '@/server/api-errors';
import { getDownloadUrl } from '@/server/uploads/queries';

const UUID = /^[0-9a-f-]{36}$/i;

/**
 * Opens a file: asks Nest for a short-lived signed link (Nest checks the caller may see the file)
 * and redirects the browser there. Download links in the app are plain links to this route, so
 * a signed URL is only ever made when someone clicks.
 */
export async function GET(
  _request: Request,
  { params }: RouteContext<'/api/events/[eventId]/uploads/[uploadId]'>,
) {
  const { eventId, uploadId } = await params;
  if (!UUID.test(eventId) || !UUID.test(uploadId)) return new Response(null, { status: 404 });
  try {
    const url = await getDownloadUrl(eventId, uploadId);
    return new Response(null, {
      status: 302,
      headers: { location: url, 'cache-control': 'no-store', 'referrer-policy': 'no-referrer' },
    });
  } catch (error) {
    if (error instanceof ApiError) {
      // 401/403/404 all read as "not there" to the browser; 503 when storage is off.
      const status = error.status === 503 ? 503 : error.status >= 500 ? 502 : 404;
      return new Response(null, { status });
    }
    throw error;
  }
}
