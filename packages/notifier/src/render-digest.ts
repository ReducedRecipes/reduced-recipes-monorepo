import type { DailyDigestInput } from './types';

export function renderDigestText(input: DailyDigestInput): string {
  const lines: string[] = [];
  lines.push(`ReducedRecipes social drafts for ${input.date}`);
  lines.push(`${input.drafts.length} drafts ready for review.`);
  lines.push('');
  for (const d of input.drafts) {
    lines.push(`- [${d.platform}] ${d.hook ?? d.caption?.slice(0, 80) ?? '(no caption)'}`);
    lines.push(`  approve: ${input.oneClickApproveBaseUrl}/approve/${d.id}`);
    lines.push(`  reject:  ${input.oneClickApproveBaseUrl}/reject/${d.id}`);
    lines.push('');
  }
  lines.push(`Or open the admin: ${input.approveBaseUrl}`);
  return lines.join('\n');
}

export function renderDigestHtml(input: DailyDigestInput): string {
  const items = input.drafts.map((d) => `
    <li style="margin-bottom: 16px;">
      <strong>${escape(d.platform)}</strong>:
      ${escape(d.hook ?? d.caption?.slice(0, 80) ?? '(no caption)')}
      <br />
      <a href="${input.oneClickApproveBaseUrl}/approve/${d.id}">Approve</a>
      &nbsp;|&nbsp;
      <a href="${input.oneClickApproveBaseUrl}/reject/${d.id}">Reject</a>
    </li>
  `).join('\n');

  return `<!doctype html>
<html><body style="font-family: system-ui, sans-serif;">
  <h1>${input.drafts.length} drafts ready</h1>
  <p>${escape(input.date)}</p>
  <ul>${items}</ul>
  <p><a href="${input.approveBaseUrl}">Open the admin app</a></p>
</body></html>`;
}

function escape(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
          .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
