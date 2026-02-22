"use client";

import { DATA_DICTIONARY } from "@/lib/dataDictionary";
import { getFeatureRqMapping } from "@/lib/featureVector";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export function DataDictionarySection() {
  const entries = Object.entries(DATA_DICTIONARY);

  return (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold">Data Dictionary</h3>
      <p className="text-sm text-muted-foreground">
        Definitions for each feature. Feature names match the feature vector
        exactly.
      </p>
      <div className="rounded-md border overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Feature Name</TableHead>
              <TableHead>Definition</TableHead>
              <TableHead>Unit</TableHead>
              <TableHead>RQ</TableHead>
              <TableHead>Interpretation</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {entries.map(([name, def]) => (
              <TableRow key={name}>
                <TableCell className="font-mono text-sm">{name}</TableCell>
                <TableCell className="max-w-md">{def.definition}</TableCell>
                <TableCell>{def.unit}</TableCell>
                <TableCell>{getFeatureRqMapping(name) || def.rq}</TableCell>
                <TableCell className="max-w-sm text-muted-foreground text-sm">
                  {def.interpretation}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
