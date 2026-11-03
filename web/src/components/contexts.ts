import React from "react";
import { Model } from "../state/model.ts";

export const ModelContext = React.createContext<Model | null>(null);
