import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { company_name, tenant_id, tenant_domain, admin_username, admin_email } = await req.json();

    if (!company_name || !tenant_id || !tenant_domain || !admin_email) {
      return Response.json({ error: 'Missing required fields' }, { status: 400 });
    }

    // Check if tenant already registered
    const existing = await base44.asServiceRole.entities.Tenant.filter({ tenant_id });
    if (existing.length > 0) {
      return Response.json({ error: 'A tenant with this Tenant ID is already registered.' }, { status: 409 });
    }

    // Create the Tenant record
    const tenant = await base44.asServiceRole.entities.Tenant.create({
      name: company_name,
      tenant_id,
      domain: tenant_domain,
      status: 'pending',
      linked_user_email: admin_email,
      notes: `Registered by: ${admin_username || admin_email}`,
    });

    // Create AdminRole scoped to this tenant only
    await base44.asServiceRole.entities.AdminRole.create({
      user_email: admin_email,
      role: 'global_admin',
      assigned_tenants: tenant.id,
      allowed_sections: 'entra,intune,security,scripts,export',
      is_active: true,
      notes: `Auto-created on tenant registration for ${company_name}`,
    });

    // Send confirmation email
    await base44.asServiceRole.integrations.Core.SendEmail({
      to: admin_email,
      subject: `Welcome to Azure Multi-Tenant Admin — ${company_name} Registered`,
      body: `Hi ${admin_username || admin_email},\n\nYour organisation "${company_name}" has been successfully registered.\n\nYour Azure Tenant ID (${tenant_id}) and domain (${tenant_domain}) are now linked to your account.\n\nYou can now log in and access your tenant dashboard.\n\nIf you have any questions, please contact support.\n\nRegards,\nAzure Multi-Tenant Admin Team`,
    });

    return Response.json({ success: true, tenant_record_id: tenant.id });
  } catch (error) {
    console.error('[registerClientTenant]', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});