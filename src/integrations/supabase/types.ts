export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      holdings: {
        Row: {
          amount: number
          as_of: string
          category: string
          created_at: string
          folio: string | null
          id: string
          isin: string | null
          linked_loan_id: string | null
          maturity_date: string | null
          member_id: string
          monthly_contribution: number
          name: string
          nav: number | null
          nav_date: string | null
          next_due: string | null
          premium: number | null
          prev_nav: number | null
          price_currency: string
          quantity: number | null
          rate: number | null
          scheme_code: string | null
          sip_active: boolean
          sip_amount: number | null
          sip_day: number | null
          sip_start: string | null
          start_date: string | null
          subtitle: string | null
          unit_price: number | null
          units: number | null
          unvested_quantity: number | null
          updated_at: string
          user_id: string
        }
        Insert: {
          amount?: number
          as_of?: string
          category: string
          created_at?: string
          folio?: string | null
          id?: string
          isin?: string | null
          linked_loan_id?: string | null
          maturity_date?: string | null
          member_id: string
          monthly_contribution?: number
          name: string
          nav?: number | null
          nav_date?: string | null
          next_due?: string | null
          premium?: number | null
          prev_nav?: number | null
          price_currency?: string
          quantity?: number | null
          rate?: number | null
          scheme_code?: string | null
          sip_active?: boolean
          sip_amount?: number | null
          sip_day?: number | null
          sip_start?: string | null
          start_date?: string | null
          subtitle?: string | null
          unit_price?: number | null
          units?: number | null
          unvested_quantity?: number | null
          updated_at?: string
          user_id?: string
        }
        Update: {
          amount?: number
          as_of?: string
          category?: string
          created_at?: string
          folio?: string | null
          id?: string
          isin?: string | null
          linked_loan_id?: string | null
          maturity_date?: string | null
          member_id?: string
          monthly_contribution?: number
          name?: string
          nav?: number | null
          nav_date?: string | null
          next_due?: string | null
          premium?: number | null
          prev_nav?: number | null
          price_currency?: string
          quantity?: number | null
          rate?: number | null
          scheme_code?: string | null
          sip_active?: boolean
          sip_amount?: number | null
          sip_day?: number | null
          sip_start?: string | null
          start_date?: string | null
          subtitle?: string | null
          unit_price?: number | null
          units?: number | null
          unvested_quantity?: number | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "holdings_linked_loan_id_fkey"
            columns: ["linked_loan_id"]
            isOneToOne: false
            referencedRelation: "loans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "holdings_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
        ]
      }
      loan_events: {
        Row: {
          amount: number
          created_at: string
          event_date: string
          id: string
          kind: string
          loan_id: string
          note: string | null
          user_id: string
        }
        Insert: {
          amount?: number
          created_at?: string
          event_date?: string
          id?: string
          kind?: string
          loan_id: string
          note?: string | null
          user_id?: string
        }
        Update: {
          amount?: number
          created_at?: string
          event_date?: string
          id?: string
          kind?: string
          loan_id?: string
          note?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "loan_events_loan_id_fkey"
            columns: ["loan_id"]
            isOneToOne: false
            referencedRelation: "loans"
            referencedColumns: ["id"]
          },
        ]
      }
      loans: {
        Row: {
          account_ref: string | null
          as_of: string
          created_at: string
          emi: number
          emi_day: number
          id: string
          kind: string
          member_id: string
          name: string
          original_principal: number
          outstanding: number
          rate: number
          rate_type: string
          user_id: string
        }
        Insert: {
          account_ref?: string | null
          as_of?: string
          created_at?: string
          emi?: number
          emi_day?: number
          id?: string
          kind?: string
          member_id: string
          name: string
          original_principal?: number
          outstanding?: number
          rate?: number
          rate_type?: string
          user_id?: string
        }
        Update: {
          account_ref?: string | null
          as_of?: string
          created_at?: string
          emi?: number
          emi_day?: number
          id?: string
          kind?: string
          member_id?: string
          name?: string
          original_principal?: number
          outstanding?: number
          rate?: number
          rate_type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "loans_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
        ]
      }
      members: {
        Row: {
          created_at: string
          id: string
          name: string
          sort: number
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          sort?: number
          user_id?: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          sort?: number
          user_id?: string
        }
        Relationships: []
      }
      policies: {
        Row: {
          cover: number
          created_at: string
          frequency: string
          id: string
          insurer: string | null
          kind: string
          member_id: string
          name: string
          next_due: string
          policy_number: string | null
          premium: number
          user_id: string
        }
        Insert: {
          cover?: number
          created_at?: string
          frequency?: string
          id?: string
          insurer?: string | null
          kind?: string
          member_id: string
          name: string
          next_due?: string
          policy_number?: string | null
          premium?: number
          user_id?: string
        }
        Update: {
          cover?: number
          created_at?: string
          frequency?: string
          id?: string
          insurer?: string | null
          kind?: string
          member_id?: string
          name?: string
          next_due?: string
          policy_number?: string | null
          premium?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "policies_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
        ]
      }
      sip_installments: {
        Row: {
          amount: number
          created_at: string
          due_date: string
          holding_id: string
          id: string
          nav: number | null
          nav_date: string | null
          status: string
          units: number
          user_id: string
        }
        Insert: {
          amount: number
          created_at?: string
          due_date: string
          holding_id: string
          id?: string
          nav?: number | null
          nav_date?: string | null
          status?: string
          units?: number
          user_id?: string
        }
        Update: {
          amount?: number
          created_at?: string
          due_date?: string
          holding_id?: string
          id?: string
          nav?: number | null
          nav_date?: string | null
          status?: string
          units?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "sip_installments_holding_id_fkey"
            columns: ["holding_id"]
            isOneToOne: false
            referencedRelation: "holdings"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      seed_household: { Args: { _uid: string }; Returns: undefined }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
