'use client';

import { useState } from 'react';
import { Radio, Save } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/hooks/use-auth';

export default function N8nConfigPage() {
  const { account } = useAuth();
  const [loading, setLoading] = useState(false);
  
  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const form = e.target as HTMLFormElement;
    const formData = new FormData(form);
    
    const supabase = createClient();
    const { error } = await supabase
      .from('accounts')
      .update({
        n8n_webhook_secret: formData.get('secret'),
        n8n_webhook_url: formData.get('url'),
      })
      .eq('id', account?.id);

    setLoading(false);
    if (error) {
      toast.error("Failed to save configuration");
    } else {
      toast.success("Configuration updated successfully");
    }
  };

  return (
    <div>
      <div className="flex items-center gap-2">
        <Radio className="h-6 w-6 text-primary" />
        <h1 className="text-2xl font-bold tracking-tight text-foreground">
          n8n Configuration
        </h1>
      </div>
      <p className="mt-1 text-sm text-muted-foreground">
        Manage your n8n integration credentials for this account.
      </p>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle>Webhook Settings</CardTitle>
          <CardDescription>
            These credentials allow secure communication between n8n and your CRM account.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSave} className="space-y-4">
            <div>
              <Label htmlFor="secret">n8n Webhook Secret</Label>
              <Input 
                id="secret" 
                name="secret" 
                type="password" 
                defaultValue={account?.n8n_webhook_secret ?? ''} 
                className="mt-1"
                placeholder="Enter your secret key"
              />
            </div>
            <div>
              <Label htmlFor="url">n8n Webhook URL</Label>
              <Input 
                id="url" 
                name="url" 
                type="url" 
                defaultValue={account?.n8n_webhook_url ?? ''} 
                className="mt-1"
                placeholder="https://your-n8n-instance.com/webhook/..."
              />
            </div>
            <Button type="submit" disabled={loading}>
              {loading ? "Saving..." : <><Save className="mr-2 h-4 w-4" /> Save Configuration</>}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
