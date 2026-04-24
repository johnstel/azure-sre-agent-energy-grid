import { createRouter, createWebHistory, type RouteRecordRaw } from 'vue-router';

const routes: RouteRecordRaw[] = [
  {
    path: '/',
    name: 'preflight',
    component: () => import('./components/PreflightPanel.vue'),
  },
  {
    path: '/deploy',
    name: 'deploy',
    component: () => import('./components/DeployPanel.vue'),
  },
  {
    path: '/destroy',
    name: 'destroy',
    component: () => import('./components/DestroyPanel.vue'),
  },
  {
    path: '/monitor',
    name: 'monitor',
    component: () => import('./components/PodGrid.vue'),
  },
  {
    path: '/scenarios',
    name: 'scenarios',
    component: () => import('./components/ScenarioGrid.vue'),
  },
];

export const router = createRouter({
  history: createWebHistory(),
  routes,
});
