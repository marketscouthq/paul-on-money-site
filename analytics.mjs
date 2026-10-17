const MEASUREMENT_ID = 'G-7F73XD3VV2';
const SITE_ORIGIN = 'https://paulonmoney.com';
const CALCULATOR_PATH = '/tools/health-plan-comparison/';
const ARTICLE_PATH = /^\/articles\/([a-z0-9]+(?:-[a-z0-9]+)*)\/$/;
const PAGE_PATHS = new Set(['/', '/about/', '/articles/', '/tools/', CALCULATOR_PATH]);
const CALCULATOR_ACTIONS = new Set(['example_load', 'video_sample_load', 'compare', 'bill_timing', 'hsa_projection']);
const ARTICLE_MILESTONES = new Set(['30_seconds_visible', '75_percent_scrolled']);
const VIDEO_PROGRESS = new Set([25, 50, 75]);
const VIDEOS = Object.freeze({
  ee2jsxj9HxE: Object.freeze({ title: 'HDHP vs PPO: Is the Cheaper Plan Really Cheaper?', provider: 'youtube' })
});
let frameSequence = 0;

export function canonicalPageLocation(value) {
  try {
    const url = new URL(value);
    if (url.origin !== SITE_ORIGIN || url.search || url.hash) return null;
    if (!PAGE_PATHS.has(url.pathname) && !ARTICLE_PATH.test(url.pathname)) return null;
    return `${SITE_ORIGIN}${url.pathname}`;
  } catch {
    return null;
  }
}

export function createEventPayload(eventName, page, detail = {}) {
  const pageLocation = canonicalPageLocation(page?.location);
  const pageTitle = typeof page?.title === 'string' ? page.title.trim() : '';
  if (!pageLocation || !pageTitle || pageTitle.length > 180) return null;
  const base = { page_location: pageLocation, page_title: pageTitle };
  if (eventName === 'page_view') return { name: eventName, params: base };
  if (eventName === 'article_engagement') {
    const slug = ARTICLE_PATH.exec(new URL(pageLocation).pathname)?.[1];
    if (!slug || detail.article_slug !== slug || !ARTICLE_MILESTONES.has(detail.milestone)) return null;
    return { name: eventName, params: { ...base, article_slug: slug, milestone: detail.milestone } };
  }
  if (eventName === 'calculator_use') {
    if (new URL(pageLocation).pathname !== CALCULATOR_PATH || detail.tool_id !== 'health_plan_comparison' || !CALCULATOR_ACTIONS.has(detail.action)) return null;
    return { name: eventName, params: { ...base, tool_id: 'health_plan_comparison', action: detail.action } };
  }
  if (['video_start', 'video_progress', 'video_complete'].includes(eventName)) {
    const path = new URL(pageLocation).pathname;
    if (path !== CALCULATOR_PATH && !ARTICLE_PATH.test(path)) return null;
    const video = VIDEOS[detail.video_id];
    if (!video || detail.video_title !== video.title || detail.provider !== video.provider) return null;
    const params = { ...base, video_id: detail.video_id, video_title: video.title, provider: video.provider };
    if (eventName === 'video_progress') {
      if (!VIDEO_PROGRESS.has(detail.video_percent)) return null;
      params.video_percent = detail.video_percent;
    }
    return { name: eventName, params };
  }
  return null;
}

function readPageInfo(documentRef) {
  const canonical = documentRef.querySelector('link[rel="canonical"]')?.href;
  const location = canonicalPageLocation(canonical);
  const title = documentRef.title;
  return location && title ? { location, title } : null;
}

function isLiveSite(windowRef) {
  return windowRef.location.protocol === 'https:' && windowRef.location.hostname === 'paulonmoney.com';
}

function installGoogleTag(windowRef, documentRef, page) {
  if (typeof windowRef.gtag === 'function' || documentRef.querySelector('script[src*="googletagmanager.com/gtag/js"],script[src*="googletagmanager.com/gtm.js"]')) return false;
  windowRef.dataLayer = windowRef.dataLayer || [];
  windowRef.gtag = function gtag() { windowRef.dataLayer.push(arguments); };
  windowRef.gtag('js', new Date());
  windowRef.gtag('config', MEASUREMENT_ID, {
    send_page_view: false,
    page_location: page.location,
    page_title: page.title,
    page_referrer: '',
    allow_google_signals: false,
    allow_ad_personalization_signals: false
  });
  const script = documentRef.createElement('script');
  script.async = true;
  script.src = `https://www.googletagmanager.com/gtag/js?id=${MEASUREMENT_ID}`;
  script.dataset.pomGa = MEASUREMENT_ID;
  documentRef.head.append(script);
  return true;
}

let youtubeApiPromise;
function loadYouTubeApi(windowRef, documentRef) {
  if (windowRef.YT?.Player) return Promise.resolve(windowRef.YT);
  if (youtubeApiPromise) return youtubeApiPromise;
  youtubeApiPromise = new Promise((resolve, reject) => {
    const previous = windowRef.onYouTubeIframeAPIReady;
    const timeout = windowRef.setTimeout(() => reject(new Error('YouTube IFrame API did not become ready.')), 15000);
    windowRef.onYouTubeIframeAPIReady = () => {
      if (typeof previous === 'function') previous();
      windowRef.clearTimeout(timeout);
      if (windowRef.YT?.Player) resolve(windowRef.YT);
      else reject(new Error('YouTube IFrame API did not expose a player.'));
    };
    if (!documentRef.querySelector('script[src="https://www.youtube.com/iframe_api"]')) {
      const script = documentRef.createElement('script');
      script.async = true;
      script.src = 'https://www.youtube.com/iframe_api';
      script.onerror = () => { windowRef.clearTimeout(timeout); reject(new Error('YouTube IFrame API failed to load.')); };
      documentRef.head.append(script);
    }
  });
  return youtubeApiPromise;
}

function bootstrap(windowRef, documentRef) {
  if (windowRef.__pomAnalyticsBooted) return;
  windowRef.__pomAnalyticsBooted = true;
  const page = readPageInfo(documentRef);
  let analyticsEnabled = Boolean(page && isLiveSite(windowRef) && installGoogleTag(windowRef, documentRef, page));
  const track = (name, detail = {}) => {
    if (!analyticsEnabled || typeof windowRef.gtag !== 'function') return false;
    const event = createEventPayload(name, page, detail);
    if (!event) return false;
    windowRef.gtag('event', event.name, event.params);
    return true;
  };

  if (analyticsEnabled) track('page_view');

  function playVideo(button, { container = null, hideButton = false } = {}) {
    const video = VIDEOS[button?.dataset?.videoId];
    if (!video || button.dataset.videoTitle !== video.title || button.tagName !== 'BUTTON') return false;
    const path = page && new URL(page.location).pathname;
    if (path !== CALCULATOR_PATH && !ARTICLE_PATH.test(path || '')) return false;
    const frame = documentRef.createElement('iframe');
    frame.id = `pom-video-${button.dataset.videoId}-${++frameSequence}`;
    frame.title = `${video.title} video player`;
    const origin = encodeURIComponent(windowRef.location.origin);
    frame.src = `https://www.youtube-nocookie.com/embed/${button.dataset.videoId}?autoplay=1&rel=0&enablejsapi=1&origin=${origin}`;
    frame.allow = 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share';
    frame.referrerPolicy = 'strict-origin-when-cross-origin';
    frame.allowFullscreen = true;
    frame.className = path === CALCULATOR_PATH ? '' : 'article-video-frame';
    if (container) container.replaceChildren(frame);
    else button.replaceWith(frame);
    if (hideButton) button.hidden = true;
    frame.focus();

    if (analyticsEnabled) {
      loadYouTubeApi(windowRef, documentRef).then(YT => {
        let started = false;
        let completed = false;
        const sentProgress = new Set();
        let pollId;
        const complete = () => {
          if (completed || !started) return;
          completed = true;
          track('video_complete', { video_id: button.dataset.videoId, video_title: video.title, provider: video.provider });
          if (pollId) windowRef.clearInterval(pollId);
        };
        const player = new YT.Player(frame.id, {
          events: {
            onReady: () => {
              const inspect = () => {
                const state = player.getPlayerState();
                if (state === YT.PlayerState.PLAYING) {
                  if (!started) {
                    started = true;
                    track('video_start', { video_id: button.dataset.videoId, video_title: video.title, provider: video.provider });
                  }
                  const duration = player.getDuration();
                  if (duration > 0) {
                    const progress = player.getCurrentTime() / duration * 100;
                    for (const threshold of VIDEO_PROGRESS) {
                      if (progress >= threshold && !sentProgress.has(threshold)) {
                        sentProgress.add(threshold);
                        track('video_progress', { video_id: button.dataset.videoId, video_title: video.title, provider: video.provider, video_percent: threshold });
                      }
                    }
                  }
                } else if (state === YT.PlayerState.ENDED) complete();
              };
              inspect();
              pollId = windowRef.setInterval(inspect, 1000);
            },
            onStateChange: event => { if (event.data === YT.PlayerState.ENDED) complete(); }
          }
        });
      }).catch(() => {});
    }
    return true;
  }

  windowRef.POMAnalytics = Object.freeze({
    calculatorUse(action) {
      return track('calculator_use', { tool_id: 'health_plan_comparison', action });
    },
    articleEngagement(milestone) {
      const slug = page && ARTICLE_PATH.exec(new URL(page.location).pathname)?.[1];
      return slug ? track('article_engagement', { article_slug: slug, milestone }) : false;
    },
    playVideo
  });

  if (analyticsEnabled && page && ARTICLE_PATH.test(new URL(page.location).pathname)) {
    const slug = ARTICLE_PATH.exec(new URL(page.location).pathname)[1];
    let visibleSeconds = 0;
    let sentTimeMilestone = false;
    const visibilityTimer = windowRef.setInterval(() => {
      if (documentRef.visibilityState === 'visible' && !documentRef.hidden) visibleSeconds += 1;
      if (visibleSeconds >= 30) {
        if (!sentTimeMilestone) {
          sentTimeMilestone = true;
          track('article_engagement', { article_slug: slug, milestone: '30_seconds_visible' });
        }
        windowRef.clearInterval(visibilityTimer);
      }
    }, 1000);
    let sentScrollMilestone = false;
    const onScroll = () => {
      if (sentScrollMilestone) return;
      const article = documentRef.querySelector('.article-copy');
      if (!article) return;
      const top = article.getBoundingClientRect().top + windowRef.scrollY;
      const readDistance = Math.max(0, windowRef.scrollY + windowRef.innerHeight - top);
      if (readDistance / Math.max(1, article.scrollHeight) >= 0.75) {
        sentScrollMilestone = track('article_engagement', { article_slug: slug, milestone: '75_percent_scrolled' });
      }
    };
    windowRef.addEventListener('scroll', onScroll, { passive: true });
  }
}

if (typeof window !== 'undefined' && typeof document !== 'undefined') bootstrap(window, document);
