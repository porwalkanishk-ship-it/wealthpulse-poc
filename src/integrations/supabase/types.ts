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
          is_hidden: boolean
          isin: string | null
          linked_loan_id: string | null
          maturity_date: string | null
          member_id: string | null
          monthly_contribution: number
          name: string
          nav: number | null
          nav_date: string | null
          next_due: string | null
          owner_profile_id: string | null
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
          is_hidden?: boolean
          isin?: string | null
          linked_loan_id?: string | null
          maturity_date?: string | null
          member_id?: string | null
          monthly_contribution?: number
          name: string
          nav?: number | null
          nav_date?: string | null
          next_due?: string | null
          owner_profile_id?: string | null
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
          is_hidden?: boolean
          isin?: string | null
          linked_loan_id?: string | null
          maturity_date?: string | null
          member_id?: string | null
          monthly_contribution?: number
          name?: string
          nav?: number | null
          nav_date?: string | null
          next_due?: string | null
          owner_profile_id?: string | null
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
            foreignKeyName: "holdings_owner_profile_id_fkey"
            columns: ["owner_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      household_members: {
        Row: {
          household_id: string
          joined_at: string
          role: string
          user_id: string
        }
        Insert: {
          household_id: string
          joined_at?: string
          role?: string
          user_id: string
        }
        Update: {
          household_id?: string
          joined_at?: string
          role?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "household_members_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
        ]
      }
      households: {
        Row: {
          created_at: string
          display_currency: string
          id: string
          invite_code: string
          name: string
        }
        Insert: {
          created_at?: string
          display_currency?: string
          id?: string
          invite_code?: string
          name: string
        }
        Update: {
          created_at?: string
          display_currency?: string
          id?: string
          invite_code?: string
          name?: string
        }
        Relationships: []
      }
      join_requests: {
        Row: {
          claim_completed_at: string | null
          claim_profile_id: string | null
          consent_at: string
          created_at: string
          creator_decision: string | null
          decided_at: string | null
          household_id: string
          household_name: string
          id: string
          leader_decision: string | null
          requester_name: string
          requester_user_id: string
          status: string
        }
        Insert: {
          claim_completed_at?: string | null
          claim_profile_id?: string | null
          consent_at?: string
          created_at?: string
          creator_decision?: string | null
          decided_at?: string | null
          household_id: string
          household_name: string
          id?: string
          leader_decision?: string | null
          requester_name: string
          requester_user_id: string
          status?: string
        }
        Update: {
          claim_completed_at?: string | null
          claim_profile_id?: string | null
          consent_at?: string
          created_at?: string
          creator_decision?: string | null
          decided_at?: string | null
          household_id?: string
          household_name?: string
          id?: string
          leader_decision?: string | null
          requester_name?: string
          requester_user_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "join_requests_claim_profile_id_fkey"
            columns: ["claim_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "join_requests_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
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
          is_hidden: boolean
          kind: string
          loan_id: string
          note: string | null
          owner_profile_id: string | null
          user_id: string
        }
        Insert: {
          amount?: number
          created_at?: string
          event_date?: string
          id?: string
          is_hidden?: boolean
          kind?: string
          loan_id: string
          note?: string | null
          owner_profile_id?: string | null
          user_id?: string
        }
        Update: {
          amount?: number
          created_at?: string
          event_date?: string
          id?: string
          is_hidden?: boolean
          kind?: string
          loan_id?: string
          note?: string | null
          owner_profile_id?: string | null
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
          {
            foreignKeyName: "loan_events_owner_profile_id_fkey"
            columns: ["owner_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
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
          is_hidden: boolean
          kind: string
          member_id: string | null
          name: string
          original_principal: number
          outstanding: number
          owner_profile_id: string | null
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
          is_hidden?: boolean
          kind?: string
          member_id?: string | null
          name: string
          original_principal?: number
          outstanding?: number
          owner_profile_id?: string | null
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
          is_hidden?: boolean
          kind?: string
          member_id?: string | null
          name?: string
          original_principal?: number
          outstanding?: number
          owner_profile_id?: string | null
          rate?: number
          rate_type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "loans_owner_profile_id_fkey"
            columns: ["owner_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
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
      notifications: {
        Row: {
          body: string | null
          created_at: string
          id: string
          link: string | null
          read_at: string | null
          title: string
          type: string
          user_id: string
        }
        Insert: {
          body?: string | null
          created_at?: string
          id?: string
          link?: string | null
          read_at?: string | null
          title: string
          type: string
          user_id: string
        }
        Update: {
          body?: string | null
          created_at?: string
          id?: string
          link?: string | null
          read_at?: string | null
          title?: string
          type?: string
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
          is_hidden: boolean
          kind: string
          member_id: string | null
          name: string
          next_due: string
          owner_profile_id: string | null
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
          is_hidden?: boolean
          kind?: string
          member_id?: string | null
          name: string
          next_due?: string
          owner_profile_id?: string | null
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
          is_hidden?: boolean
          kind?: string
          member_id?: string | null
          name?: string
          next_due?: string
          owner_profile_id?: string | null
          policy_number?: string | null
          premium?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "policies_owner_profile_id_fkey"
            columns: ["owner_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          base_currency: string
          country: string | null
          created_at: string
          display_name: string
          hide_everything: boolean
          id: string
          managed_by_user_id: string | null
          owner_user_id: string | null
          relationship: string
        }
        Insert: {
          base_currency?: string
          country?: string | null
          created_at?: string
          display_name: string
          hide_everything?: boolean
          id?: string
          managed_by_user_id?: string | null
          owner_user_id?: string | null
          relationship?: string
        }
        Update: {
          base_currency?: string
          country?: string | null
          created_at?: string
          display_name?: string
          hide_everything?: boolean
          id?: string
          managed_by_user_id?: string | null
          owner_user_id?: string | null
          relationship?: string
        }
        Relationships: []
      }
      sip_installments: {
        Row: {
          amount: number
          created_at: string
          due_date: string
          holding_id: string
          id: string
          is_hidden: boolean
          nav: number | null
          nav_date: string | null
          owner_profile_id: string | null
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
          is_hidden?: boolean
          nav?: number | null
          nav_date?: string | null
          owner_profile_id?: string | null
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
          is_hidden?: boolean
          nav?: number | null
          nav_date?: string | null
          owner_profile_id?: string | null
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
          {
            foreignKeyName: "sip_installments_owner_profile_id_fkey"
            columns: ["owner_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      _notify: {
        Args: {
          _body: string
          _link: string
          _title: string
          _type: string
          _user: string
        }
        Returns: undefined
      }
      _try_complete_claim: { Args: { _request_id: string }; Returns: boolean }
      add_managed_profile: {
        Args: { _name: string; _relationship: string }
        Returns: string
      }
      can_read_row: {
        Args: { _is_hidden: boolean; _profile_id: string }
        Returns: boolean
      }
      can_see_profile: { Args: { _profile_id: string }; Returns: boolean }
      can_write_profile: { Args: { _profile_id: string }; Returns: boolean }
      cancel_join_request: { Args: { _request_id: string }; Returns: undefined }
      complete_onboarding: {
        Args: { _base_currency: string; _country: string; _full_name: string }
        Returns: string
      }
      create_household: { Args: { _name: string }; Returns: string }
      decide_claim: {
        Args: { _approve: boolean; _request_id: string }
        Returns: undefined
      }
      decide_join: {
        Args: { _approve: boolean; _request_id: string }
        Returns: undefined
      }
      gen_invite_code: { Args: never; Returns: string }
      get_invite_code: { Args: never; Returns: string }
      is_household_leader: { Args: { _household_id: string }; Returns: boolean }
      is_household_member: { Args: { _household_id: string }; Returns: boolean }
      is_profile_creator: { Args: { _profile_id: string }; Returns: boolean }
      leave_household: { Args: never; Returns: undefined }
      lookup_household: { Args: { _code: string }; Returns: Json }
      my_household_id: { Args: never; Returns: string }
      profile_household_id: { Args: { _profile_id: string }; Returns: string }
      request_join: {
        Args: { _claim_profile_id: string; _code: string; _consent: boolean }
        Returns: string
      }
      rotate_invite_code: { Args: never; Returns: string }
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
