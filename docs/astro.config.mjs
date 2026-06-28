// @ts-check
import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';
import node from '@astrojs/node';

// https://astro.build/config
export default defineConfig({
  site: 'https://formbaker.dev',
  // ponytail: hybrid mode — all docs pages are SSG (static), but server
  // endpoints live at /api/* for features like playground execution, form
  // preview, and search. Static pages get the prerender default; API routes
  // get SSR-only (no prerender) by checking request in middleware or by
  // setting prerender=false explicitly.
  output: 'static',
  adapter: node({
    mode: 'standalone',
  }),
  integrations: [
    starlight({
      title: 'Formbaker',
      description:
        'Dynamic form engine — build forms where fields appear, disappear, and revalidate based on user input.',
      logo: {
        src: './src/assets/logo.svg',
      },
      social: [
        { icon: 'github', label: 'GitHub', href: 'https://github.com/t1enne/formbaker' },
      ],
      editLink: {
        baseUrl: 'https://github.com/t1enne/formbaker/edit/main/docs/',
      },
      sidebar: [
        {
          label: 'Getting Started',
          items: [
            { label: 'Introduction', slug: '' },
            { label: 'Quick Start', slug: 'getting-started/quick-start' },
            { label: 'Installation', slug: 'getting-started/installation' },
            { label: 'Core Concepts', slug: 'getting-started/concepts' },
          ],
        },
        {
          label: 'Guides',
          items: [
            { label: 'Defining Forms', slug: 'guides/defining-forms' },
            {
              label: 'Dependencies & Visibility',
              slug: 'guides/dependencies',
            },
            { label: 'Validation Plugins', slug: 'guides/plugins' },
            {
              label: 'React Hook Form',
              slug: 'guides/integration-react-hook-form',
            },
            { label: 'Angular', slug: 'guides/integration-angular' },
            { label: 'Serialization', slug: 'guides/serialization' },
          ],
        },
        {
          label: 'API Reference',
          items: [
            { label: 'create()', slug: 'api/create' },
            { label: 'Form Instance', slug: 'api/form-instance' },
            { label: 'Schema', slug: 'api/schema' },
            { label: 'Dependencies', slug: 'api/dependencies' },
            { label: 'Plugins', slug: 'api/plugins' },
            { label: 'Integrations', slug: 'api/integrations' },
          ],
        },
        {
          label: 'Examples',
          items: [
            { label: 'Survey Form', slug: 'examples/survey' },
            { label: 'Conditional Wizard', slug: 'examples/wizard' },
            {
              label: 'Configurator UI',
              slug: 'examples/configurator',
            },
          ],
        },
      ],
      customCss: ['./src/styles/custom.css'],
    }),
  ],
});
