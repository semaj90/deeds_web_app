import { Button as PrimitiveButton, Select as PrimitiveSelect } from 'bits-ui';
import { Dialog as CompoundDialog } from '../dialog/index.js';
import { Card as CompoundCard } from '../card/index.js';

export const Button = PrimitiveButton;
export const Dialog = CompoundDialog;
export const Card = CompoundCard;
export const Select = PrimitiveSelect;

export {
  PrimitiveButton as ButtonCompound,
  CompoundDialog as DialogCompound,
  CompoundCard as CardCompound,
  PrimitiveSelect as SelectCompound,
};
