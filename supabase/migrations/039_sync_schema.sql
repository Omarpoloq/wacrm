drop extension if exists "pg_net";
create table "public"."instagram_config" (
    "id" uuid not null default gen_random_uuid(),
    "account_id" uuid not null,
    "user_id" uuid not null,
    "instagram_business_id" text not null,
    "access_token" text not null,
    "verify_token" text,
    "app_id" text,
    "app_secret" text,
    "page_id" text,
    "status" text default 'pending'::text,
    "connected_at" timestamp with time zone,
    "created_at" timestamp with time zone default now(),
    "updated_at" timestamp with time zone default now(),
    "last_error" text
      );
alter table "public"."instagram_config" enable row level security;
  create table "public"."n8n_flows" (
    "id" uuid not null default gen_random_uuid(),
    "user_id" uuid not null,
    "name" text not null,
    "webhook_url" text not null,
    "description" text,
    "is_active" boolean default true,
    "created_at" timestamp with time zone default now(),
    "account_id" uuid
      );
alter table "public"."n8n_flows" enable row level security;
alter table "public"."contacts" add column "channel" text default 'whatsapp'::text;
alter table "public"."contacts" add column "external_id" text;
alter table "public"."contacts" add column "funnel_stage" text not null default 'nuevo'::text;
alter table "public"."conversations" add column "assigned_flow_id" uuid;
alter table "public"."conversations" add column "bot_active" boolean not null default true;
alter table "public"."conversations" add column "channel" text default 'whatsapp'::text;
alter table "public"."messages" add column "channel" text default 'whatsapp'::text;
alter table "public"."messages" add column "metadata" jsonb;
alter table "public"."whatsapp_config" add column "phone_number" text;
alter table "public"."whatsapp_config" add column "provider" text default 'meta'::text;
alter table "public"."whatsapp_config" add column "ycloud_api_key" text;
CREATE UNIQUE INDEX contacts_account_id_external_id_unique ON public.contacts USING btree (account_id, external_id);
CREATE INDEX idx_contacts_account_channel ON public.contacts USING btree (account_id, channel);
CREATE INDEX idx_contacts_external_id_channel ON public.contacts USING btree (external_id, channel);
CREATE INDEX idx_conversations_account_channel ON public.conversations USING btree (account_id, channel);
CREATE INDEX idx_conversations_assigned_flow_id ON public.conversations USING btree (assigned_flow_id);
CREATE INDEX idx_conversations_contact_channel ON public.conversations USING btree (contact_id, channel);
CREATE INDEX idx_instagram_config_account ON public.instagram_config USING btree (account_id);
CREATE INDEX idx_instagram_config_business_id ON public.instagram_config USING btree (instagram_business_id);
CREATE INDEX idx_messages_channel ON public.messages USING btree (channel);
CREATE INDEX idx_n8n_flows_is_active ON public.n8n_flows USING btree (is_active);
CREATE INDEX idx_n8n_flows_user_id ON public.n8n_flows USING btree (user_id);
CREATE UNIQUE INDEX instagram_config_account_id_instagram_business_id_key ON public.instagram_config USING btree (account_id, instagram_business_id);
CREATE UNIQUE INDEX instagram_config_pkey ON public.instagram_config USING btree (id);
CREATE UNIQUE INDEX n8n_flows_pkey ON public.n8n_flows USING btree (id);
alter table "public"."instagram_config" add constraint "instagram_config_pkey" PRIMARY KEY using index "instagram_config_pkey";
alter table "public"."n8n_flows" add constraint "n8n_flows_pkey" PRIMARY KEY using index "n8n_flows_pkey";
alter table "public"."contacts" add constraint "contacts_account_id_external_id_unique" UNIQUE using index "contacts_account_id_external_id_unique";
alter table "public"."conversations" add constraint "conversations_assigned_flow_id_fkey" FOREIGN KEY (assigned_flow_id) REFERENCES public.n8n_flows(id) ON DELETE SET NULL not valid;
alter table "public"."conversations" validate constraint "conversations_assigned_flow_id_fkey";
alter table "public"."instagram_config" add constraint "instagram_config_account_id_fkey" FOREIGN KEY (account_id) REFERENCES public.accounts(id) ON DELETE CASCADE not valid;
alter table "public"."instagram_config" validate constraint "instagram_config_account_id_fkey";
alter table "public"."instagram_config" add constraint "instagram_config_account_id_instagram_business_id_key" UNIQUE using index "instagram_config_account_id_instagram_business_id_key";
alter table "public"."n8n_flows" add constraint "n8n_flows_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE not valid;
alter table "public"."n8n_flows" validate constraint "n8n_flows_user_id_fkey";
  on "public"."instagram_config"
  as permissive
  for update
  to public
using ((auth.uid() = user_id))
with check ((auth.uid() = user_id));
  create policy "Usuarios eliminan su configuraci├│n de Instagram"
  on "public"."instagram_config"
  as permissive
  for delete
  to public
using ((auth.uid() = user_id));
  create policy "Usuarios insertan configuraci├│n de Instagram para s├뿯½ mismos"
  on "public"."instagram_config"
  as permissive
  for insert
  to public
with check ((auth.uid() = user_id));
  create policy "Usuarios ven su propia configuraci├│n de Instagram"
  on "public"."instagram_config"
  as permissive
  for select
  to public
using ((auth.uid() = user_id));
  create policy "n8n_flows_delete"
  on "public"."n8n_flows"
  as permissive
  for delete
  to public
using ((auth.uid() = user_id));
  create policy "n8n_flows_insert"
  on "public"."n8n_flows"
  as permissive
  for insert
  to public
with check ((auth.uid() = user_id));
  create policy "n8n_flows_select"
  on "public"."n8n_flows"
  as permissive
  for select
  to public
using ((auth.uid() = user_id));
  create policy "n8n_flows_update"
  on "public"."n8n_flows"
  as permissive
  for update
  to public
using ((auth.uid() = user_id));
  create policy "Service role write chat-media"
  on "storage"."objects"
  as permissive
  for insert
  to public
with check ((bucket_id = 'chat-media'::text));
