/**
 * Cloudflare RUM helpers shared by pull-kpis.mjs and check-kpi-creds.mjs
 * (ARY-556): account-tag resolution and the referer classification both scripts
 * report on.
 *
 * The GraphQL RUM datasets require an explicit accountTag filter — omitting it
 * makes Cloudflare enumerate every account on the user and fail with "not
 * authorized for that account". So the tag is mandatory. But it is only an
 * *identifier*, not a credential, so rather than making a human copy it out of a
 * dashboard URL we look for it in whatever the token can already read.
 *
 * An `Account Analytics: Read` token cannot call `/accounts` (that needs an
 * account-settings scope), hence the fallback chain. Setting CF_ACCOUNT_TAG
 * skips all of it.
 */

const CF_API = 'https://api.cloudflare.com/client/v4';

const SEARCH_ENGINE_HOSTS = /(^|\.)(google|bing|duckduckgo|ecosia|yahoo|yandex|baidu|brave)\./i;

/**
 * Split a rumPageloadEventsAdaptiveGroups referer breakdown into direct /
 * organic-search / referral visits, keeping the named external hosts.
 *
 * Shared so the puller and the preflight can never disagree about what a `0`
 * means: `organic: 0` with a populated `hosts` list is genuinely direct traffic,
 * whereas `organic: 0` with everything in `direct` and no hosts at all is the
 * signature of Cloudflare not returning the refererHost dimension.
 *
 * @returns {{direct: number, organic: number, referral: number, hosts: {host: string, visits: number}[]}}
 */
export function classifyReferers(rows = []) {
  const split = { direct: 0, organic: 0, referral: 0, hosts: [] };
  for (const row of rows) {
    const host = row.dimensions?.refererHost || '';
    const visits = row.sum?.visits ?? 0;
    if (!host || host === '(none)' || host === 'myvaulto.com' || host === 'marketing.myvaulto.com') {
      split.direct += visits; // direct / self-referral
      continue;
    }
    if (SEARCH_ENGINE_HOSTS.test(host)) split.organic += visits;
    else split.referral += visits;
    split.hosts.push({ host, visits });
  }
  return split;
}

/** @returns {Promise<{tag: string, via: string}>} */
export async function resolveAccountTag(token) {
  if (process.env.CF_ACCOUNT_TAG) {
    return { tag: process.env.CF_ACCOUNT_TAG, via: 'CF_ACCOUNT_TAG' };
  }

  const get = async (path) => {
    const res = await fetch(`${CF_API}${path}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const body = await res.json().catch(() => ({}));
    return body.success ? body.result ?? [] : null;
  };

  const accounts = await get('/accounts');
  if (accounts?.length === 1) return { tag: accounts[0].id, via: '/accounts' };
  if (accounts && accounts.length > 1) {
    throw new Error(
      `token sees ${accounts.length} accounts — set CF_ACCOUNT_TAG to one of: ` +
        accounts.map((a) => `${a.id} (${a.name})`).join(', '),
    );
  }

  const zones = await get('/zones');
  const zoneAccount = zones?.find((z) => z.account?.id)?.account;
  if (zoneAccount) return { tag: zoneAccount.id, via: '/zones' };

  const memberships = await get('/memberships');
  const memberAccount = memberships?.find((m) => m.account?.id)?.account;
  if (memberAccount) return { tag: memberAccount.id, via: '/memberships' };

  throw new Error(
    'cannot determine the account id from this token — tried /accounts, /zones ' +
      'and /memberships, and an Account Analytics-only token can read none of ' +
      'them. Set CF_ACCOUNT_TAG to the 32-hex id in the dashboard URL ' +
      '(dash.cloudflare.com/<account_id>/…).',
  );
}
