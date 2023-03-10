import i18n from 'i18next';
import * as yup from 'yup';
import onChange from 'on-change';
import axios from 'axios';
import uniqueId from 'lodash.uniqueid';
import resources from './locales/index.js';
import render from './view.js';

export const buildProxyUrl = (url) => {
  const proxy = 'https://allorigins.hexlet.app/get';
  const proxyURL = new URL(proxy);
  proxyURL.searchParams.set('url', url);
  proxyURL.searchParams.set('disableCache', 'true');
  return proxyURL.href;
};

const parseRSS = (xml) => {
  const parser = new DOMParser();
  let xmlDoc;
  try {
    xmlDoc = parser.parseFromString(xml, 'text/xml');
  } catch (e) {
    throw new Error(`Error parsing XML: ${e.message}`);
  }

  const feed = {
    title: xmlDoc.querySelector('title').textContent,
    link: xmlDoc.querySelector('link').textContent,
    description: xmlDoc.querySelector('description').textContent,
  };

  const posts = [...xmlDoc.querySelectorAll('item')].map((post) => ({
    title: post.querySelector('title').textContent,
    link: post.querySelector('link').textContent,
    description: post.querySelector('description').textContent,
  }));

  return { feed, posts };
};

const addNewPosts = (posts, feedId, state) => {
  const isDouble = (post1, post2) => feedId === post2.feedId && post1.title === post2.title;
  const newPosts = posts.filter((post1) => !state.posts.some((post2) => isDouble(post1, post2)));
  const newPostsWithIds = newPosts.map((post) => ({
    feedId,
    id: uniqueId(),
    ...post,
  }));
  state.posts.push(...newPostsWithIds);
};

const loadRss = (url, state) => {
  const proxyUrl = buildProxyUrl(url);
  axios.get(proxyUrl)
    .then((response) => {
      const { feed, posts } = parseRSS(response.data.contents);

      const feedId = uniqueId();
      state.feeds.push({ id: feedId, url, ...feed });
      addNewPosts(posts, feedId, state);

      state.error = null;
      state.formState = 'sent';
    })
    .catch((error) => {
      state.error = (error.code === 'ERR_NETWORK') ? 'networkError' : 'urlDownloadError';
      state.formState = 'error';
    });
};

const updateRss = (state) => {
  const promises = state.feeds.map((feed) => {
    const { url } = feed;
    const proxyURL = buildProxyUrl(url);
    return axios.get(proxyURL);
  });
  Promise.all(promises)
    .then((responses) => {
      responses.forEach((response, index) => {
        const { posts } = parseRSS(response.data.contents);
        const feedId = state.feeds[index].id;
        addNewPosts(posts, feedId, state);
      });
    })
    .finally(() => {
      setTimeout(updateRss, 5000, state);
    });
};

const validateUrl = (url, urlsList) => {
  const urlSchema = yup.string().url('invalidUrlFormat').required('urlIsRequired').notOneOf(urlsList, 'urlIsDuplicate');
  return urlSchema.validate(url, { abortEarly: false });
};

const app = async () => {
  const i18nInstance = i18n.createInstance();
  await i18nInstance.init({
    lng: 'ru',
    debug: false,
    resources,
  });

  const elements = {
    form: document.querySelector('.rss-form'),
    urlField: document.getElementById('url-input'),
    feedbackElement: document.querySelector('p.feedback'),
    submitButton: document.querySelector('button[type="submit"]'),
    postsContainer: document.querySelector('.posts'),
    feedsContainer: document.querySelector('.feeds'),
    modal: {
      modalTitle: document.querySelector('.modal-title'),
      modalBody: document.querySelector('.modal-body'),
      modalLink: document.querySelector('.modal-footer > .full-article'),
    },
  };

  const initialState = {
    feeds: [],
    posts: [],
    formState: 'filling',
    error: null,
    uiState: {
      clickedDataId: null,
      clickedIds: new Set(),
    },
  };

  const state = onChange(initialState, render(elements, initialState, i18nInstance));

  elements.form.addEventListener('submit', (e) => {
    e.preventDefault();
    state.error = null;
    state.formState = 'sending';
    const formData = new FormData(e.target);
    const url = formData.get('url');
    const urlsList = state.feeds.map((feed) => feed.url);
    validateUrl(url, urlsList)
      .then(() => {
        loadRss(url, state);
      })
      .catch((error) => {
        state.error = error.message;
        state.formState = 'error';
      });
  });

  elements.postsContainer.addEventListener('click', (e) => {
    const clickedDataId = e.target.getAttribute('data-id');
    state.uiState.clickedDataId = clickedDataId;
    state.uiState.clickedIds.add(clickedDataId);
  });

  updateRss(state);
};

export default app;
