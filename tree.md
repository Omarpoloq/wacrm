Directory structure:
└── omarpoloq-wacrm/
    ├── README.md
    ├── AGENTS.md
    ├── CHANGELOG.md
    ├── CLAUDE.md
    ├── components.json
    ├── CONTRIBUTING.md
    ├── eslint.config.mjs
    ├── LICENSE
    ├── next.config.ts
    ├── package.json
    ├── postcss.config.mjs
    ├── tsconfig.json
    ├── vitest.config.ts
    ├── .editorconfig
    ├── .env.local.example
    ├── .prettierignore
    ├── .prettierrc
    ├── docs/
    │   ├── mcp.md
    │   └── public-api.md
    ├── mcp-server/
    │   ├── README.md
    │   ├── glama.json
    │   ├── package.json
    │   ├── server.json
    │   ├── tsconfig.json
    │   ├── .env.example
    │   └── src/
    │       ├── client.ts
    │       ├── config.ts
    │       ├── index.ts
    │       └── tools/
    │           ├── broadcast.ts
    │           ├── index.ts
    │           ├── read.ts
    │           ├── shared.ts
    │           └── write.ts
    ├── src/
    │   ├── middleware.test.ts
    │   ├── middleware.ts
    │   ├── app/
    │   │   ├── globals.css
    │   │   ├── icon.tsx
    │   │   ├── layout.tsx
    │   │   ├── page.tsx
    │   │   ├── (auth)/
    │   │   │   ├── layout.tsx
    │   │   │   ├── forgot-password/
    │   │   │   │   └── page.tsx
    │   │   │   ├── login/
    │   │   │   │   └── page.tsx
    │   │   │   └── signup/
    │   │   │       └── page.tsx
    │   │   ├── (dashboard)/
    │   │   │   ├── dashboard-shell.tsx
    │   │   │   ├── layout.tsx
    │   │   │   ├── agents/
    │   │   │   │   └── page.tsx
    │   │   │   ├── automations/
    │   │   │   │   ├── page.tsx
    │   │   │   │   ├── [id]/
    │   │   │   │   │   ├── edit/
    │   │   │   │   │   │   └── page.tsx
    │   │   │   │   │   └── logs/
    │   │   │   │   │       └── page.tsx
    │   │   │   │   └── new/
    │   │   │   │       └── page.tsx
    │   │   │   ├── broadcasts/
    │   │   │   │   ├── page.tsx
    │   │   │   │   ├── [id]/
    │   │   │   │   │   └── page.tsx
    │   │   │   │   └── new/
    │   │   │   │       └── page.tsx
    │   │   │   ├── contacts/
    │   │   │   │   └── page.tsx
    │   │   │   ├── dashboard/
    │   │   │   │   └── page.tsx
    │   │   │   ├── flows/
    │   │   │   │   ├── page.tsx
    │   │   │   │   └── [id]/
    │   │   │   │       ├── page.tsx
    │   │   │   │       └── runs/
    │   │   │   │           └── page.tsx
    │   │   │   ├── inbox/
    │   │   │   │   └── page.tsx
    │   │   │   ├── notifications/
    │   │   │   │   └── page.tsx
    │   │   │   ├── pipelines/
    │   │   │   │   └── page.tsx
    │   │   │   └── settings/
    │   │   │       └── page.tsx
    │   │   ├── api/
    │   │   │   ├── account/
    │   │   │   │   ├── route.ts
    │   │   │   │   ├── api-keys/
    │   │   │   │   │   ├── route.ts
    │   │   │   │   │   └── [id]/
    │   │   │   │   │       └── route.ts
    │   │   │   │   ├── invitations/
    │   │   │   │   │   ├── route.ts
    │   │   │   │   │   └── [id]/
    │   │   │   │   │       └── route.ts
    │   │   │   │   ├── members/
    │   │   │   │   │   ├── route.ts
    │   │   │   │   │   └── [userId]/
    │   │   │   │   │       └── route.ts
    │   │   │   │   └── transfer-ownership/
    │   │   │   │       └── route.ts
    │   │   │   ├── ai/
    │   │   │   │   ├── autoreply/
    │   │   │   │   │   └── [conversationId]/
    │   │   │   │   │       └── route.ts
    │   │   │   │   ├── config/
    │   │   │   │   │   └── route.ts
    │   │   │   │   ├── draft/
    │   │   │   │   │   └── route.ts
    │   │   │   │   ├── knowledge/
    │   │   │   │   │   ├── route.ts
    │   │   │   │   │   ├── [id]/
    │   │   │   │   │   │   └── route.ts
    │   │   │   │   │   └── reindex/
    │   │   │   │   │       └── route.ts
    │   │   │   │   ├── playground/
    │   │   │   │   │   └── route.ts
    │   │   │   │   ├── test/
    │   │   │   │   │   └── route.ts
    │   │   │   │   └── usage/
    │   │   │   │       └── route.ts
    │   │   │   ├── automations/
    │   │   │   │   ├── route.ts
    │   │   │   │   ├── [id]/
    │   │   │   │   │   ├── route.ts
    │   │   │   │   │   └── duplicate/
    │   │   │   │   │       └── route.ts
    │   │   │   │   ├── cron/
    │   │   │   │   │   └── route.ts
    │   │   │   │   └── engine/
    │   │   │   │       └── route.ts
    │   │   │   ├── contacts/
    │   │   │   │   └── [id]/
    │   │   │   │       └── tags/
    │   │   │   │           ├── route.test.ts
    │   │   │   │           └── route.ts
    │   │   │   ├── flows/
    │   │   │   │   ├── route.ts
    │   │   │   │   ├── [id]/
    │   │   │   │   │   ├── route.ts
    │   │   │   │   │   ├── activate/
    │   │   │   │   │   │   └── route.ts
    │   │   │   │   │   └── runs/
    │   │   │   │   │       └── route.ts
    │   │   │   │   ├── cron/
    │   │   │   │   │   └── route.ts
    │   │   │   │   └── templates/
    │   │   │   │       └── route.ts
    │   │   │   ├── instagram/
    │   │   │   │   ├── send/
    │   │   │   │   │   └── route.ts
    │   │   │   │   └── webhook/
    │   │   │   │       └── route.ts
    │   │   │   ├── invitations/
    │   │   │   │   └── [token]/
    │   │   │   │       ├── peek/
    │   │   │   │       │   └── route.ts
    │   │   │   │       └── redeem/
    │   │   │   │           └── route.ts
    │   │   │   ├── quick-replies/
    │   │   │   │   ├── route.ts
    │   │   │   │   └── [id]/
    │   │   │   │       └── route.ts
    │   │   │   ├── v1/
    │   │   │   │   ├── broadcasts/
    │   │   │   │   │   ├── route.ts
    │   │   │   │   │   └── [id]/
    │   │   │   │   │       └── route.ts
    │   │   │   │   ├── contacts/
    │   │   │   │   │   ├── route.ts
    │   │   │   │   │   └── [id]/
    │   │   │   │   │       └── route.ts
    │   │   │   │   ├── conversations/
    │   │   │   │   │   ├── route.ts
    │   │   │   │   │   └── [id]/
    │   │   │   │   │       ├── route.ts
    │   │   │   │   │       └── messages/
    │   │   │   │   │           └── route.ts
    │   │   │   │   ├── me/
    │   │   │   │   │   └── route.ts
    │   │   │   │   ├── messages/
    │   │   │   │   │   └── route.ts
    │   │   │   │   └── webhooks/
    │   │   │   │       ├── route.ts
    │   │   │   │       └── [id]/
    │   │   │   │           └── route.ts
    │   │   │   └── whatsapp/
    │   │   │       ├── broadcast/
    │   │   │       │   └── route.ts
    │   │   │       ├── config/
    │   │   │       │   ├── route.ts
    │   │   │       │   └── verify-registration/
    │   │   │       │       └── route.ts
    │   │   │       ├── media/
    │   │   │       │   └── [mediaId]/
    │   │   │       │       └── route.ts
    │   │   │       ├── react/
    │   │   │       │   └── route.ts
    │   │   │       ├── send/
    │   │   │       │   ├── route.test.ts
    │   │   │       │   └── route.ts
    │   │   │       ├── templates/
    │   │   │       │   ├── [id]/
    │   │   │       │   │   └── route.ts
    │   │   │       │   ├── submit/
    │   │   │       │   │   └── route.ts
    │   │   │       │   └── sync/
    │   │   │       │       └── route.ts
    │   │   │       └── webhook/
    │   │   │           └── route.ts
    │   │   └── join/
    │   │       ├── layout.tsx
    │   │       └── [token]/
    │   │           └── page.tsx
    │   ├── components/
    │   │   ├── themed-toaster.tsx
    │   │   ├── agents/
    │   │   │   ├── ai-playground.tsx
    │   │   │   └── ai-usage.tsx
    │   │   ├── auth/
    │   │   │   └── require-role.tsx
    │   │   ├── broadcasts/
    │   │   │   ├── step1-choose-template.tsx
    │   │   │   ├── step2-select-audience.tsx
    │   │   │   ├── step3-personalize.tsx
    │   │   │   └── step4-schedule-send.tsx
    │   │   ├── contacts/
    │   │   │   ├── contact-detail-view.tsx
    │   │   │   ├── contact-form.tsx
    │   │   │   ├── custom-fields-manager.tsx
    │   │   │   └── import-modal.tsx
    │   │   ├── dashboard/
    │   │   │   ├── activity-feed.tsx
    │   │   │   ├── conversations-chart.tsx
    │   │   │   ├── empty-state.tsx
    │   │   │   ├── metric-card.tsx
    │   │   │   ├── pipeline-donut.tsx
    │   │   │   ├── quick-actions.tsx
    │   │   │   ├── response-time-chart.tsx
    │   │   │   └── skeleton.tsx
    │   │   ├── flows/
    │   │   │   ├── flow-builder.tsx
    │   │   │   ├── flow-canvas.tsx
    │   │   │   ├── flow-editor-shell.tsx
    │   │   │   ├── flow-editor-state.test.ts
    │   │   │   ├── flow-editor-state.tsx
    │   │   │   ├── header.tsx
    │   │   │   ├── shared.test.ts
    │   │   │   ├── shared.tsx
    │   │   │   ├── validation-panel.tsx
    │   │   │   └── forms/
    │   │   │       ├── fields.tsx
    │   │   │       └── node-config-form.tsx
    │   │   ├── inbox/
    │   │   │   ├── ai-thread-banner.tsx
    │   │   │   ├── contact-sidebar.tsx
    │   │   │   ├── conversation-list.tsx
    │   │   │   ├── message-actions.tsx
    │   │   │   ├── message-bubble.tsx
    │   │   │   ├── message-composer.tsx
    │   │   │   ├── message-reactions.tsx
    │   │   │   ├── message-thread.tsx
    │   │   │   ├── quick-reply-picker.tsx
    │   │   │   ├── reply-quote.tsx
    │   │   │   └── template-picker.tsx
    │   │   ├── interactive/
    │   │   │   ├── interactive-builder.tsx
    │   │   │   └── interactive-preview.tsx
    │   │   ├── layout/
    │   │   │   ├── header.tsx
    │   │   │   ├── mode-toggle.tsx
    │   │   │   └── sidebar.tsx
    │   │   ├── pipelines/
    │   │   │   ├── deal-card.tsx
    │   │   │   ├── deal-form.tsx
    │   │   │   ├── pipeline-analytics.tsx
    │   │   │   ├── pipeline-board.tsx
    │   │   │   └── pipeline-settings.tsx
    │   │   ├── presence/
    │   │   │   ├── presence-dot.tsx
    │   │   │   └── presence-heartbeat.tsx
    │   │   ├── settings/
    │   │   │   ├── ai-config.tsx
    │   │   │   ├── ai-knowledge.tsx
    │   │   │   ├── api-keys-settings.tsx
    │   │   │   ├── appearance-panel.tsx
    │   │   │   ├── custom-fields-settings.tsx
    │   │   │   ├── deals-settings.tsx
    │   │   │   ├── fields-and-tags-panel.tsx
    │   │   │   ├── invite-member-dialog.tsx
    │   │   │   ├── members-tab.tsx
    │   │   │   ├── password-form.tsx
    │   │   │   ├── profile-form.tsx
    │   │   │   ├── quick-replies-manager.tsx
    │   │   │   ├── role-meta.ts
    │   │   │   ├── security-panel.tsx
    │   │   │   ├── sessions-card.tsx
    │   │   │   ├── settings-chip.tsx
    │   │   │   ├── settings-overview.tsx
    │   │   │   ├── settings-panel-head.tsx
    │   │   │   ├── settings-rail.tsx
    │   │   │   ├── settings-sections.ts
    │   │   │   ├── tag-manager.tsx
    │   │   │   ├── template-manager.tsx
    │   │   │   └── whatsapp-config.tsx
    │   │   ├── tremor/
    │   │   │   ├── bar-chart.tsx
    │   │   │   ├── chart-colors.ts
    │   │   │   ├── get-y-axis-domain.ts
    │   │   │   └── use-on-window-resize.ts
    │   │   └── ui/
    │   │       ├── accordion.tsx
    │   │       ├── alert.tsx
    │   │       ├── avatar.tsx
    │   │       ├── badge.tsx
    │   │       ├── button.tsx
    │   │       ├── card.tsx
    │   │       ├── checkbox.tsx
    │   │       ├── dialog.tsx
    │   │       ├── dropdown-menu-group-label.test.tsx
    │   │       ├── dropdown-menu.tsx
    │   │       ├── gated-button.tsx
    │   │       ├── input.tsx
    │   │       ├── label.tsx
    │   │       ├── popover.tsx
    │   │       ├── radio-group.tsx
    │   │       ├── scroll-area.tsx
    │   │       ├── select.tsx
    │   │       ├── separator.tsx
    │   │       ├── sheet.tsx
    │   │       ├── switch.tsx
    │   │       ├── table.tsx
    │   │       ├── tabs.tsx
    │   │       ├── textarea.tsx
    │   │       └── tooltip.tsx
    │   ├── hooks/
    │   │   ├── use-auth.tsx
    │   │   ├── use-broadcast-sending.ts
    │   │   ├── use-can.ts
    │   │   ├── use-presence.ts
    │   │   ├── use-realtime.ts
    │   │   ├── use-theme.tsx
    │   │   ├── use-total-unread.ts
    │   │   └── use-unread-notifications.ts
    │   ├── i18n/
    │   │   └── request.ts
    │   ├── lib/
    │   │   ├── broadcast-status.test.ts
    │   │   ├── broadcast-status.ts
    │   │   ├── currency.test.ts
    │   │   ├── currency.ts
    │   │   ├── presence.test.ts
    │   │   ├── presence.ts
    │   │   ├── rate-limit.test.ts
    │   │   ├── rate-limit.ts
    │   │   ├── template-status.ts
    │   │   ├── themes.ts
    │   │   ├── utils.ts
    │   │   ├── account/
    │   │   │   └── members.ts
    │   │   ├── ai/
    │   │   │   ├── admin-client.ts
    │   │   │   ├── auto-reply.test.ts
    │   │   │   ├── auto-reply.ts
    │   │   │   ├── chunk.test.ts
    │   │   │   ├── chunk.ts
    │   │   │   ├── config.test.ts
    │   │   │   ├── config.ts
    │   │   │   ├── context.test.ts
    │   │   │   ├── context.ts
    │   │   │   ├── defaults.ts
    │   │   │   ├── embeddings.test.ts
    │   │   │   ├── embeddings.ts
    │   │   │   ├── generate.test.ts
    │   │   │   ├── generate.ts
    │   │   │   ├── handoff.test.ts
    │   │   │   ├── handoff.ts
    │   │   │   ├── knowledge.test.ts
    │   │   │   ├── knowledge.ts
    │   │   │   ├── query.test.ts
    │   │   │   ├── query.ts
    │   │   │   ├── types.ts
    │   │   │   ├── usage.test.ts
    │   │   │   ├── usage.ts
    │   │   │   ├── validate.ts
    │   │   │   └── providers/
    │   │   │       ├── anthropic.ts
    │   │   │       ├── openai.ts
    │   │   │       └── shared.ts
    │   │   ├── api/
    │   │   │   └── v1/
    │   │   │       ├── contacts.test.ts
    │   │   │       ├── contacts.ts
    │   │   │       ├── conversations.test.ts
    │   │   │       ├── conversations.ts
    │   │   │       ├── pagination.test.ts
    │   │   │       ├── pagination.ts
    │   │   │       └── respond.ts
    │   │   ├── api-keys/
    │   │   │   ├── keys.test.ts
    │   │   │   ├── keys.ts
    │   │   │   ├── scopes.test.ts
    │   │   │   ├── scopes.ts
    │   │   │   └── store.ts
    │   │   ├── auth/
    │   │   │   ├── account.test.ts
    │   │   │   ├── account.ts
    │   │   │   ├── api-context.test.ts
    │   │   │   ├── api-context.ts
    │   │   │   ├── invitations.test.ts
    │   │   │   ├── invitations.ts
    │   │   │   ├── roles.test.ts
    │   │   │   └── roles.ts
    │   │   ├── automations/
    │   │   │   ├── admin-client.ts
    │   │   │   ├── engine.test.ts
    │   │   │   ├── engine.ts
    │   │   │   ├── meta-send.ts
    │   │   │   ├── steps-tree.ts
    │   │   │   ├── templates.ts
    │   │   │   ├── trigger-meta.ts
    │   │   │   ├── validate.test.ts
    │   │   │   └── validate.ts
    │   │   ├── contacts/
    │   │   │   ├── dedupe.test.ts
    │   │   │   ├── dedupe.ts
    │   │   │   ├── parse-contact-csv.test.ts
    │   │   │   ├── parse-contact-csv.ts
    │   │   │   ├── resolve-import-tags.ts
    │   │   │   ├── tag-api.ts
    │   │   │   ├── tag-chain.ts
    │   │   │   ├── tag-events.test.ts
    │   │   │   ├── tag-events.ts
    │   │   │   ├── tag-write.test.ts
    │   │   │   └── tag-write.ts
    │   │   ├── dashboard/
    │   │   │   ├── date-utils.test.ts
    │   │   │   ├── date-utils.ts
    │   │   │   ├── queries.ts
    │   │   │   └── types.ts
    │   │   ├── flows/
    │   │   │   ├── admin-client.ts
    │   │   │   ├── edges.test.ts
    │   │   │   ├── edges.ts
    │   │   │   ├── engine.test.ts
    │   │   │   ├── engine.ts
    │   │   │   ├── fallback.test.ts
    │   │   │   ├── fallback.ts
    │   │   │   ├── layout.test.ts
    │   │   │   ├── layout.ts
    │   │   │   ├── meta-send.ts
    │   │   │   ├── templates.ts
    │   │   │   ├── types.ts
    │   │   │   ├── validate.test.ts
    │   │   │   └── validate.ts
    │   │   ├── inbox/
    │   │   │   ├── conversations.test.ts
    │   │   │   └── conversations.ts
    │   │   ├── instagram/
    │   │   │   └── verify-meta-signature.ts
    │   │   ├── storage/
    │   │   │   ├── upload-media.test.ts
    │   │   │   └── upload-media.ts
    │   │   ├── supabase/
    │   │   │   ├── client.ts
    │   │   │   └── server.ts
    │   │   ├── webhooks/
    │   │   │   ├── deliver.test.ts
    │   │   │   ├── deliver.ts
    │   │   │   ├── endpoints.test.ts
    │   │   │   ├── endpoints.ts
    │   │   │   ├── events.test.ts
    │   │   │   ├── events.ts
    │   │   │   ├── sign.test.ts
    │   │   │   ├── sign.ts
    │   │   │   ├── ssrf.test.ts
    │   │   │   └── ssrf.ts
    │   │   └── whatsapp/
    │   │       ├── broadcast-core.test.ts
    │   │       ├── broadcast-core.ts
    │   │       ├── encryption.test.ts
    │   │       ├── encryption.ts
    │   │       ├── interactive.test.ts
    │   │       ├── interactive.ts
    │   │       ├── meta-api.media.test.ts
    │   │       ├── meta-api.resumable.test.ts
    │   │       ├── meta-api.test.ts
    │   │       ├── meta-api.ts
    │   │       ├── phone-utils.test.ts
    │   │       ├── phone-utils.ts
    │   │       ├── registration.test.ts
    │   │       ├── resolve-conversation.test.ts
    │   │       ├── resolve-conversation.ts
    │   │       ├── send-message.test.ts
    │   │       ├── send-message.ts
    │   │       ├── template-components.test.ts
    │   │       ├── template-components.ts
    │   │       ├── template-header-handle.test.ts
    │   │       ├── template-header-handle.ts
    │   │       ├── template-lifecycle.test.ts
    │   │       ├── template-row-guard.ts
    │   │       ├── template-send-builder.test.ts
    │   │       ├── template-send-builder.ts
    │   │       ├── template-status-normalize.test.ts
    │   │       ├── template-status-normalize.ts
    │   │       ├── template-validators.test.ts
    │   │       ├── template-validators.ts
    │   │       ├── template-webhook.test.ts
    │   │       ├── template-webhook.ts
    │   │       ├── webhook-signature.test.ts
    │   │       └── webhook-signature.ts
    │   └── types/
    │       ├── index.ts
    │       └── opus-recorder.d.ts
    ├── supabase/
    │   └── migrations/
    │       ├── 001_initial_schema.sql
    │       ├── 002_pipelines_enhancements.sql
    │       ├── 003_broadcast_recipient_wamid.sql
    │       ├── 004_contact_delete_set_null.sql
    │       ├── 005_broadcast_counts_incremental.sql
    │       ├── 006_automations.sql
    │       ├── 007_automations_increment_counter.sql
    │       ├── 008_profile_avatars_storage.sql
    │       ├── 009_message_actions.sql
    │       ├── 010_flows.sql
    │       ├── 011_profile_beta_features.sql
    │       ├── 012_flows_increment_counter.sql
    │       ├── 013_whatsapp_config_phone_number_id_unique.sql
    │       ├── 014_message_templates_meta_integration.sql
    │       ├── 015_whatsapp_config_registration.sql
    │       ├── 016_flow_media.sql
    │       ├── 017_account_sharing.sql
    │       ├── 018_account_member_rpcs.sql
    │       ├── 019_invitation_rpcs.sql
    │       ├── 020_account_sharing_followups.sql
    │       ├── 021_account_default_currency.sql
    │       ├── 022_contact_phone_dedup.sql
    │       ├── 023_chat_media.sql
    │       ├── 024_member_presence.sql
    │       ├── 025_filter_contacts_by_tags.sql
    │       ├── 026_api_keys.sql
    │       ├── 027_notifications.sql
    │       ├── 028_webhook_endpoints.sql
    │       ├── 029_ai_reply.sql
    │       ├── 030_ai_knowledge.sql
    │       ├── 031_ai_reply_slot_grant.sql
    │       ├── 032_fix_ai_knowledge_membership.sql
    │       ├── 033_ai_reply_polish.sql
    │       ├── 034_fix_profiles_update_rls.sql
    │       ├── 035_interactive_messages.sql
    │       └── 036_conversation_contact_dedup.sql
    └── .github/
        ├── CODE_OF_CONDUCT.md
        ├── CODEOWNERS
        ├── dependabot.yml
        ├── pull_request_template.md
        ├── SECURITY.md
        ├── ISSUE_TEMPLATE/
        │   ├── bug_report.yml
        │   ├── config.yml
        │   └── feature_request.yml
        └── workflows/
            └── ci.yml
