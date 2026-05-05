export function isInAppBrowser(): boolean {
  const ua = navigator.userAgent || "";
  return (
    /FBAN|FBAV|Instagram|Twitter|Line\/|Snapchat|Pinterest|LinkedIn|TikTok|ProductHunt/i.test(ua) ||
    (!/Safari/i.test(ua) && /AppleWebKit/i.test(ua) && /Mobile/i.test(ua))
  );
}
