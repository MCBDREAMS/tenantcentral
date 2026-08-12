import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { company_name, tenant_id, tenant_domain, admin_username, admin_email } = await req.json();

    if (!company_name || !tenant_id || !tenant_domain || !admin_email) {
      return Response.json({ error: 'Missing required fields' }, { status: 400 });
    }

    // Self-registration only: the role must be assigned to the caller's own account.
    // Reject any payload where admin_email does not match the authenticated user.
    if (admin_email.trim().toLowerCase() !== (user.email || '').toLowerCase()) {
      return Response.json({ error: 'You may only register your own account.' }, { status: 403 });
    }

    // Validate Azure Tenant ID format (GUID)
    const guidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!guidRegex.test(tenant_id.trim())) {
      return Response.json({ error: 'Invalid Azure Tenant ID format. Must be a GUID (xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx).' }, { status: 400 });
    }

    const sendEmail = async (to, subject, body) => {
      try {
        await base44.asServiceRole.integrations.Core.SendEmail({ to, subject, body });
      } catch (emailErr) {
        console.warn('[registerClientTenant] Email send failed (non-fatal):', emailErr.message);
      }
    };

    // Check if this Azure Tenant ID is already registered
    const existing = await base44.asServiceRole.entities.Tenant.filter({ tenant_id: tenant_id.trim() });

    if (existing.length > 0) {
      // Tenant exists — this is a secondary user joining an existing tenant as Standard User
      const existingTenant = existing[0];

      // Check if this email already has a role
      const alreadyLinked = await base44.asServiceRole.entities.AdminRole.filter({ user_email: admin_email, is_active: true });
      if (alreadyLinked.length > 0) {
        return Response.json({ error: 'This email already has a role assigned. Contact your Tenant Admin.' }, { status: 409 });
      }

      // Create readonly (standard user) role scoped to this tenant
      await base44.asServiceRole.entities.AdminRole.create({
        user_email: admin_email,
        role: 'readonly',
        assigned_tenants: existingTenant.id,
        allowed_sections: 'entra,intune,security,scripts,export',
        is_active: true,
        notes: `Standard user registered for tenant ${company_name} on ${new Date().toISOString().slice(0, 10)}`,
      });

      await sendEmail(
        admin_email,
        `You've been added to ${company_name} — Azure Multi-Tenant Admin`,
        `Hi ${admin_username || admin_email},\n\nYou have been registered as a Standard User for the organisation "${company_name}".\n\nYour access is currently read-only. Your Tenant Administrator can elevate your permissions as needed.\n\nAzure Tenant ID: ${tenant_id}\nDomain: ${tenant_domain}\n\nYou can now log in to view your tenant dashboard.\n\nRegards,\nAzure Multi-Tenant Admin Team`
      );

      return Response.json({ success: true, user_type: 'standard_user', tenant_record_id: existingTenant.id });
    }

    // New tenant — first registrant becomes Tenant Admin
    const tenant = await base44.asServiceRole.entities.Tenant.create({
      name: company_name,
      tenant_id: tenant_id.trim(),
      domain: tenant_domain.trim(),
      status: 'pending',
      linked_user_email: admin_email,
      notes: `Registered by: ${admin_username || admin_email}`,
    });

    // First registrant gets tenant_admin role scoped strictly to their new tenant
    await base44.asServiceRole.entities.AdminRole.create({
      user_email: admin_email,
      role: 'tenant_admin',
      assigned_tenants: tenant.id,
      allowed_sections: 'entra,intune,security,scripts,export,approval_queue,deployment_plans',
      is_active: true,
      notes: `Tenant Admin — auto-created on registration for ${company_name}`,
    });

    await sendEmail(
      admin_email,
      `Welcome to Azure Multi-Tenant Admin — ${company_name} Registered`,
      `Hi ${admin_username || admin_email},\n\nYour organisation "${company_name}" has been successfully registered.\n\nYou have been assigned as Tenant Administrator for this tenant.\n\nAzure Tenant ID: ${tenant_id}\nDomain: ${tenant_domain}\n\nAs Tenant Administrator you can:\n- View and manage all aspects of your tenant\n- Elevate other users' access levels\n- Manage policies, devices, users and scripts\n\nYou can now log in and access your tenant dashboard.\n\nRegards,\nAzure Multi-Tenant Admin Team`
    );

    return Response.json({ success: true, user_type: 'tenant_admin', tenant_record_id: tenant.id });
  } catch (error) {
    console.error('[registerClientTenant]', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});