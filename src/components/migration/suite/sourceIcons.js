import { Boxes, Building2, Cloud, FolderOpen, Globe, HardDrive } from "lucide-react";

export const SOURCE_ICONS = {
  sharepoint_onprem: Boxes,
  sharepoint_online: Globe,
  file_share: FolderOpen,
  google_workspace: Cloud,
  box: HardDrive,
  m365_tenant: Building2,
};

export function sourceIcon(value) {
  return SOURCE_ICONS[value] || Boxes;
}