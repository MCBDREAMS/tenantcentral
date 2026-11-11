import React from "react";
import SourceSitesCard from "./SourceSitesCard";
import DestinationSitesCard from "./DestinationSitesCard";

export default function SharePointSitesPanel({ project, tenants = [], onRefresh }) {
  return (
    <div className="space-y-4">
      <SourceSitesCard project={project} tenants={tenants} onRefresh={onRefresh} />
      <DestinationSitesCard project={project} />
    </div>
  );
}